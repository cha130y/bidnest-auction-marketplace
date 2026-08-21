import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import {
  ThrottleAuth,
  ThrottleOtp
} from '../common/decorators/throttle-auth.decorator';
import { AuthService } from './auth.service';
import {
  AuthTokensResponse,
  PendingTwoFactorResponse
} from './dto/auth-result.response';
import { AuthUserResponse } from './dto/auth-user.response';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @ThrottleAuth()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'AUTH-001 — register a local account',
    description:
      'Creates the account and its profile. Registration does not sign the ' +
      'user in: logging in still goes through email/password plus the ' +
      'mandatory email OTP (AUTH-002 / AUTH-007).'
  })
  @ApiCreatedResponse({ type: AuthUserResponse })
  @ApiConflictResponse({ description: 'Email is already registered' })
  register(@Body() dto: RegisterDto): Promise<AuthUserResponse> {
    return this.authService.register(dto);
  }

  @Public()
  @ThrottleAuth()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'AUTH-002 — step one, email and password',
    description:
      'Checks the credentials and mails a one-time code. No token is issued ' +
      'here: post the same credentials plus the code to /auth/2fa/verify to ' +
      'finish signing in.'
  })
  @ApiOkResponse({ type: PendingTwoFactorResponse })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @ApiForbiddenResponse({ description: 'Account is suspended or deactivated' })
  login(@Body() dto: LoginDto): Promise<PendingTwoFactorResponse> {
    return this.authService.login(dto);
  }

  @Public()
  @ThrottleOtp()
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'AUTH-007 — step two, exchange the emailed code for tokens',
    description:
      'Takes the original credentials together with the six-digit code. The ' +
      'code is single-use and expires; a wrong, expired or already-spent ' +
      'code all answer the same way on purpose.'
  })
  @ApiOkResponse({ type: AuthTokensResponse })
  @ApiUnauthorizedResponse({ description: 'Bad credentials or bad code' })
  verifyTwoFactor(
    @Body() dto: VerifyTwoFactorDto
  ): Promise<AuthTokensResponse> {
    return this.authService.verifyTwoFactor(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'AUTH-004 — trade a refresh token for a fresh pair',
    description:
      'Public because the refresh token is the credential: an expired access ' +
      'token must not stop a client from renewing. The old refresh token is ' +
      'spent as the new one is issued, so replaying it later revokes every ' +
      'session on the account.'
  })
  @ApiOkResponse({ type: AuthTokensResponse })
  @ApiUnauthorizedResponse({ description: 'Unknown, expired or spent token' })
  @ApiForbiddenResponse({ description: 'Account is suspended or deactivated' })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensResponse> {
    return this.authService.refresh(dto);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'AUTH-004 — revoke the refresh session',
    description:
      'Always answers 204, whether or not the token matched, so it cannot be ' +
      'used to probe which tokens are live and stays safe to call twice.'
  })
  @ApiNoContentResponse({ description: 'Session revoked, or nothing to do' })
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.authService.logout(dto);
  }

  @Public()
  @ThrottleAuth()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'AUTH-005 — mail a single-use reset link',
    description:
      'Always answers 202, whether or not the address has an account. The ' +
      'SRS requires that this neither confirms nor denies that an email is ' +
      'registered, so it cannot be used to harvest accounts.'
  })
  @ApiAcceptedResponse({ description: 'Handled — says nothing either way' })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @ThrottleAuth()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'AUTH-005 — spend the link and set a new password',
    description:
      'The link works once and expires. On success every refresh session on ' +
      'the account is revoked, so each device has to sign in again.'
  })
  @ApiNoContentResponse({ description: 'Password changed, sessions revoked' })
  @ApiUnauthorizedResponse({ description: 'Wrong, expired or spent link' })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @ThrottleAuth()
  @Post('2fa/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'AUTH-007 — mail a fresh code',
    description:
      'Burns the previous code and sends a new one. Rate limited by ' +
      'OTP_RESEND_COOLDOWN_SECONDS.'
  })
  @ApiOkResponse({ type: PendingTwoFactorResponse })
  @ApiTooManyRequestsResponse({ description: 'Still inside the cooldown' })
  resendTwoFactor(@Body() dto: LoginDto): Promise<PendingTwoFactorResponse> {
    return this.authService.resendTwoFactor(dto);
  }
}
