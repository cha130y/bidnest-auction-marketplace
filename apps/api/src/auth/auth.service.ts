import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvVariable } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthTokensResponse,
  EmailRequiredResponse,
  PendingTwoFactorResponse
} from './dto/auth-result.response';
import { AuthUserResponse } from './dto/auth-user.response';
import { LoginDto } from './dto/login.dto';
import { OAuthLoginDto, VerifyOAuthDto } from './dto/oauth.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';
import { HashingService } from './hashing.service';
import { PasswordResetService } from './password-reset.service';
import type { AuthProvider } from '../../generated/prisma/enums';
import type { OAuthTokenVerifier } from './oauth/oauth-profile';
import { GOOGLE_VERIFIER, LINE_VERIFIER } from './oauth/oauth-profile';
import { OAuthService } from './oauth/oauth.service';
import { TokenService } from './token.service';
import { TrustedDeviceService } from './trusted-device.service';
import { TwoFactorService } from './two-factor.service';

/** Prisma raises P2002 when a write violates a unique index. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

/** Everything the auth flows need about an account, profile included. */
const accountSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  passwordHash: true,
  createdAt: true,
  profile: {
    select: { firstName: true, lastName: true, displayName: true }
  }
} as const;

type Account = {
  id: string;
  email: string;
  role: AuthUserResponse['role'];
  status: AuthUserResponse['status'];
  passwordHash: string | null;
  createdAt: Date;
  profile: {
    firstName: string;
    lastName: string | null;
    displayName: string;
  } | null;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hashing: HashingService,
    private readonly twoFactor: TwoFactorService,
    private readonly tokens: TokenService,
    private readonly passwordReset: PasswordResetService,
    private readonly oauth: OAuthService,
    private readonly trustedDevices: TrustedDeviceService,
    private readonly config: ConfigService<EnvVariable, true>,
    @Inject(GOOGLE_VERIFIER) private readonly google: OAuthTokenVerifier,
    @Inject(LINE_VERIFIER) private readonly line: OAuthTokenVerifier
  ) {}

  /**
   * AUTH-001 — local registration. The user row and its profile are written
   * through a single nested create so we can never end up with an account
   * that has no profile attached.
   */
  async register(dto: RegisterDto): Promise<AuthUserResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true }
    });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await this.hashing.hash(dto.password);

    // The findUnique above only catches the common case; two requests racing
    // on the same address both pass it, so the unique index is the real guard.
    const user = await this.prisma.user
      .create({
        data: {
          email: dto.email,
          passwordHash,
          profile: {
            create: {
              firstName: dto.firstName,
              lastName: dto.lastName ?? null,
              displayName: dto.displayName
            }
          }
        },
        select: accountSelect
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictException('Email is already registered');
        }
        throw error;
      });

    return this.toAuthUser(user);
  }

  /**
   * AUTH-002 step one. Credentials are checked and an OTP is mailed, but no
   * token is issued yet — that only happens in verifyTwoFactor.
   */
  async login(
    dto: LoginDto
  ): Promise<PendingTwoFactorResponse | AuthTokensResponse> {
    const account = await this.authenticate(dto);

    // An admin signs in on the password alone, where the environment allows
    // it. Off by default and set per environment — see ADMIN_SKIP_2FA in
    // config/env.validation.ts for what it costs and why it exists.
    // AUTH-007 still holds for every ordinary account either way.
    if (
      account.role === 'ADMIN' &&
      this.config.get('ADMIN_SKIP_2FA', { infer: true })
    ) {
      this.logger.warn(`Admin ${account.id} signed in without a code`);
      return this.completeLogin(account);
    }

    // AUTH-007 — a browser that has already answered a code for this account
    // is let through without another one. The password was still checked a
    // line ago: the device stands in for the second factor, never the first.
    if (await this.trustedDevices.isTrusted(account.id, dto.deviceToken)) {
      return this.completeLogin(account);
    }

    // Re-posting the login form inside the cooldown must not mail a second
    // code; the one already in the inbox is still the live one.
    const cooldown = await this.twoFactor.checkCooldown(account.id);
    if (!cooldown.blocked) {
      await this.twoFactor.issue(account);
    }

    return {
      status: 'PENDING_2FA',
      expiresInMinutes: this.twoFactor.ttlMinutes,
      resendAfterSeconds: cooldown.blocked
        ? cooldown.retryAfterSeconds
        : this.twoFactor.cooldownSeconds
    };
  }

  /**
   * AUTH-002 step two / AUTH-007. The password is verified again alongside the
   * OTP, so a leaked code on its own is worthless.
   */
  async verifyTwoFactor(dto: VerifyTwoFactorDto): Promise<AuthTokensResponse> {
    const account = await this.authenticate(dto);

    if (!(await this.twoFactor.consume(account.id, dto.otp))) {
      // Wrong, expired and already-used codes are one answer on purpose.
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    const result = await this.completeLogin(account);

    // Only now. A device is trusted on the strength of a code that was
    // actually answered — trusting it any earlier would hand out the exemption
    // for exactly the credential the code exists to backstop.
    if (dto.rememberDevice) {
      result.deviceToken = await this.trustedDevices.remember(
        account.id,
        dto.deviceLabel
      );
    }

    return result;
  }

  /** AUTH-007 — resend, rate limited so the inbox cannot be flooded. */
  async resendTwoFactor(dto: LoginDto): Promise<PendingTwoFactorResponse> {
    const account = await this.authenticate(dto);

    const cooldown = await this.twoFactor.checkCooldown(account.id);
    if (cooldown.blocked) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'A code was sent recently, please wait before asking again',
          retryAfterSeconds: cooldown.retryAfterSeconds
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    await this.twoFactor.issue(account);

    return {
      status: 'PENDING_2FA',
      expiresInMinutes: this.twoFactor.ttlMinutes,
      resendAfterSeconds: this.twoFactor.cooldownSeconds
    };
  }

  /**
   * AUTH-004 — trade a refresh token for a fresh pair. The old token is spent
   * in the same transaction that opens the new session, so a client always
   * holds exactly one live refresh token.
   */
  async refresh(dto: RefreshTokenDto): Promise<AuthTokensResponse> {
    const lookup = await this.tokens.lookupRefreshToken(dto.refreshToken);

    if (lookup.outcome === 'REPLAYED') {
      // The token was already spent, so either it leaked or a stale client
      // retried. Cheap to cut every session and make them sign in again;
      // expensive to be wrong about a stolen one.
      this.logger.warn(
        `Refresh token replayed for user ${lookup.user.id} — revoking all sessions`
      );
      await this.tokens.revokeAllSessions(lookup.user.id);
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (lookup.outcome !== 'VALID') {
      // Unknown and expired are one answer: never confirm a token existed.
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (lookup.user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active');
    }

    return {
      ...(await this.tokens.rotate(lookup.sessionId, lookup.user)),
      user: await this.currentUser(lookup.user.id)
    };
  }

  /**
   * AUTH-004 — logout. Answers the same way whether or not the token matched,
   * so it cannot be used to probe which tokens are live, and it stays safe to
   * call twice.
   */
  async logout(dto: RefreshTokenDto): Promise<void> {
    const lookup = await this.tokens.lookupRefreshToken(dto.refreshToken);

    if (lookup.outcome === 'VALID' || lookup.outcome === 'EXPIRED') {
      await this.tokens.revokeSession(lookup.sessionId);
    }
  }

  /**
   * AUTH-005 — ask for a reset link. Returns nothing either way: the SRS is
   * explicit that this must not confirm or deny that an address is registered,
   * so a caller cannot use it to harvest accounts.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    await this.passwordReset.issue(dto.email);
  }

  /**
   * AUTH-005 — spend the link and set the new password. Every refresh session
   * on the account is revoked in the process, which is what forces a fresh
   * login on every device the SRS asks for.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const owner = await this.passwordReset.consume(dto.token);

    if (!owner) {
      // Wrong, expired and already-spent links answer identically.
      throw new UnauthorizedException('Invalid or expired reset link');
    }

    const passwordHash = await this.hashing.hash(dto.password);

    await this.prisma.user.update({
      where: { id: owner.userId },
      data: { passwordHash }
    });

    await this.tokens.revokeAllSessions(owner.userId);
    // And every browser that had been let past the code. Revoking the sessions
    // alone would leave the longer-lived permission standing: whoever caused
    // the reset could sign in from their remembered browser with the new
    // password and never be asked for a code — which is precisely the door a
    // reset is meant to shut.
    await this.trustedDevices.revokeAll(owner.userId);

    this.logger.log(
      `Password reset completed for user ${owner.userId} — all sessions and ` +
        'trusted devices revoked'
    );
  }

  /**
   * AUTH-003 / AUTH-006 step one. The provider token is verified with the
   * provider, the account is resolved or created, and an OTP goes out — no
   * session yet, because AUTH-007 makes the second factor mandatory on every
   * login path, provider sign-ins included.
   */
  async oauthLogin(
    provider: AuthProvider,
    dto: OAuthLoginDto
  ): Promise<
    PendingTwoFactorResponse | EmailRequiredResponse | AuthTokensResponse
  > {
    const resolution = await this.resolveOAuthAccount(provider, dto);

    if (resolution.outcome === 'EMAIL_REQUIRED') {
      return {
        status: 'EMAIL_REQUIRED',
        message:
          'This Line account has no email address. Send one with the token to finish signing up.'
      };
    }

    // AUTH-007 — same exemption the local path gets. The provider already
    // proved who this is; the code is the second factor, and a browser that
    // has answered one before stands in for it.
    if (
      await this.trustedDevices.isTrusted(resolution.user.id, dto.deviceToken)
    ) {
      return this.issueForResolved(resolution.user);
    }

    const cooldown = await this.twoFactor.checkCooldown(resolution.user.id);
    if (!cooldown.blocked) {
      await this.twoFactor.issue(resolution.user);
    }

    return {
      status: 'PENDING_2FA',
      expiresInMinutes: this.twoFactor.ttlMinutes,
      resendAfterSeconds: cooldown.blocked
        ? cooldown.retryAfterSeconds
        : this.twoFactor.cooldownSeconds
    };
  }

  /**
   * AUTH-007 step two for a provider login. The token is verified again next
   * to the code, so a leaked code on its own is worth nothing.
   */
  async verifyOAuth(
    provider: AuthProvider,
    dto: VerifyOAuthDto
  ): Promise<AuthTokensResponse> {
    const resolution = await this.resolveOAuthAccount(provider, dto);

    if (resolution.outcome === 'EMAIL_REQUIRED') {
      throw new UnauthorizedException('Finish signing up before verifying');
    }

    const account = resolution.user;

    if (!(await this.twoFactor.consume(account.id, dto.otp))) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    const result = await this.issueForResolved(account);

    if (dto.rememberDevice) {
      result.deviceToken = await this.trustedDevices.remember(
        account.id,
        dto.deviceLabel
      );
    }

    return result;
  }

  /**
   * The tail of a provider sign-in, where the account came back from
   * resolveOAuthAccount rather than from a credential check.
   *
   * Separate from completeLogin only because that resolution carries fewer
   * fields than a local login does, so the profile is re-read here to make the
   * response the same shape either way.
   */
  private async issueForResolved(account: {
    id: string;
    email: string;
    role: AuthUserResponse['role'];
    status: AuthUserResponse['status'];
  }): Promise<AuthTokensResponse> {
    const { accessToken, refreshToken } = await this.tokens.issue(account);

    await this.prisma.user.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() }
    });
    // Matters most here. A Line account's address was typed by its owner, not
    // vouched for by anyone, and this code coming back is the only evidence
    // the address is really theirs.
    await this.markEmailVerified(account.id);

    return {
      accessToken,
      refreshToken,
      user: await this.currentUser(account.id)
    };
  }

  private async resolveOAuthAccount(
    provider: AuthProvider,
    dto: OAuthLoginDto
  ) {
    const verifier = provider === 'GOOGLE' ? this.google : this.line;
    const profile = await verifier.verify(dto.idToken);
    return this.oauth.resolveAccount(profile, dto.email);
  }

  /**
   * The last few steps of every successful sign-in, wherever it came from.
   *
   * Local, Google and Line all arrive here having proved the account belongs
   * to the caller, and all three owe the same things afterwards: a token pair,
   * a login timestamp, and an address that now counts as verified.
   */
  private async completeLogin(account: Account): Promise<AuthTokensResponse> {
    const { accessToken, refreshToken } = await this.tokens.issue(account);

    await this.prisma.user.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() }
    });
    await this.markEmailVerified(account.id);

    return { accessToken, refreshToken, user: this.toAuthUser(account) };
  }

  /**
   * AUTH-007 — a code that went out by email and came back proves the address.
   *
   * Every login path ends here, which is the point: before this, the column was
   * written once, when an OAuth account was created, and never again. A local
   * signup stayed unverified forever no matter how many codes its owner had
   * read, and so did a Line account whose owner typed the address themselves —
   * exactly the case the column exists to distinguish.
   *
   * `updateMany` for the `null` guard: the first code to arrive is the moment
   * of verification, and a later login must not push that timestamp forward.
   */
  private async markEmailVerified(userId: string) {
    await this.prisma.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() }
    });
  }

  /** Re-reads the profile so the refreshed response matches the register one. */
  private async currentUser(userId: string): Promise<AuthUserResponse> {
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: accountSelect
    });

    if (!account) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.toAuthUser(account);
  }

  /**
   * Shared credential check. A missing account, an OAuth-only account and a
   * wrong password all produce the same 401 — only the suspended case is
   * called out, because AUTH-002 requires rejecting it up front.
   */
  private async authenticate(dto: LoginDto): Promise<Account> {
    const account = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: accountSelect
    });

    if (!account?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!(await this.hashing.compare(dto.password, account.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (account.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active');
    }

    return account;
  }

  private toAuthUser(account: Account): AuthUserResponse {
    return {
      id: account.id,
      email: account.email,
      role: account.role,
      status: account.status,
      firstName: account.profile?.firstName ?? '',
      lastName: account.profile?.lastName ?? null,
      displayName: account.profile?.displayName ?? '',
      createdAt: account.createdAt
    };
  }
}
