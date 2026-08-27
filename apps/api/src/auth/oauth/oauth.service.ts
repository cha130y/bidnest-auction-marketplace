import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger
} from '@nestjs/common';
import type { AuthProvider } from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import type { OAuthProfile } from './oauth-profile';

export type ResolvedAccount = {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
};

/**
 * The account a provider profile maps to, or the reason it cannot map yet.
 *
 * `EMAIL_REQUIRED` is the Line case. AUTH-006 allows a Line account with no
 * address, but AUTH-007 makes an emailed OTP mandatory on every login path and
 * users.email is NOT NULL — so a brand new Line user has to supply an address
 * before an account can exist at all. Inventing a placeholder would satisfy
 * the column and then quietly break the OTP that guards the login.
 */
export type AccountResolution =
  | { outcome: 'RESOLVED'; user: ResolvedAccount }
  | { outcome: 'EMAIL_REQUIRED' };

/** Longest a display name may be, matching user_profiles.display_name. */
const DISPLAY_NAME_MAX = 100;

/**
 * A readable stand-in for when a provider sends no name at all. Both profile
 * name columns are NOT NULL, and USR-001 puts `displayName` on every public
 * auction and listing, so the fallback is something a stranger will read —
 * `somchai@example.com` reads far better as "somchai" than as a timestamp.
 */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0]?.trim() ?? '';
  // Addresses are validated before they get here, so an empty local part means
  // something very odd; "BidNest user" is still better than an empty column.
  return local === '' ? 'BidNest user' : local.slice(0, DISPLAY_NAME_MAX);
}

/**
 * Providers are not bound by our column widths, so a long name has to be cut
 * rather than allowed to fail the insert. Returns undefined for a blank one so
 * the caller can fall through to the email.
 */
export function clampName(name: string | undefined): string | undefined {
  const trimmed = name?.trim();
  return trimmed ? trimmed.slice(0, DISPLAY_NAME_MAX) : undefined;
}

/** How each provider spells its own name in a sentence. */
const PROVIDER_LABEL: Record<AuthProvider, string> = {
  GOOGLE: 'Google',
  LINE: 'LINE'
};

/**
 * Why the address cannot be used, put in terms of the way in that does work.
 *
 * "That address is taken" leaves someone at a wall with no idea which of the
 * three doors is theirs — and the reason this refuses at all is that one of
 * them already is.
 */
export function refusalFor(
  provider: AuthProvider,
  existing: {
    passwordHash: string | null;
    authAccounts: { provider: AuthProvider }[];
  }
): string {
  // Same provider, different account id: two Google accounts sharing one
  // address. The unique index says this too; this turns it into an answer.
  if (existing.authAccounts.some((held) => held.provider === provider)) {
    return `This account is already linked to a different ${PROVIDER_LABEL[provider]} account`;
  }

  if (existing.passwordHash) {
    return 'That address is already registered with a password. Sign in with your password instead.';
  }

  const other = existing.authAccounts[0]?.provider;
  if (other) {
    return `That address is already registered with ${PROVIDER_LABEL[other]}. Sign in with ${PROVIDER_LABEL[other]} instead.`;
  }

  // Neither a password nor a provider — nothing can sign this account in at
  // all. It should not be reachable, but pointing someone at a password they
  // do not have would be worse than saying only what is certain.
  return 'That address is already registered.';
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * AUTH-003 / AUTH-006 — turn a verified provider profile into an account,
   * opening a new one the first time we see it.
   *
   * Three ways out, and only three: the account this provider account is
   * already on, a new account when the address is free, or a refusal when the
   * address belongs to someone who signs in another way. It never joins a
   * provider to an account that already exists — see the refusal below.
   *
   * `email` is only ever used to *find* an existing account, never to prove
   * who the caller is: that is what the verified provider token already did.
   */
  async resolveAccount(
    profile: OAuthProfile,
    suppliedEmail?: string
  ): Promise<AccountResolution> {
    const linked = await this.prisma.authAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId
        }
      },
      select: {
        user: {
          select: { id: true, email: true, role: true, status: true }
        }
      }
    });

    if (linked) return this.asResolved(linked.user);

    // Not linked yet. An address is needed either to find the existing account
    // or to open a new one.
    const email =
      (profile.emailVerified ? profile.email : undefined) ??
      suppliedEmail?.trim().toLowerCase();

    if (!email) return { outcome: 'EMAIL_REQUIRED' };

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: {
        passwordHash: true,
        // Every provider on the account, not only this one: the refusal below
        // names the way in that does work, and it cannot name what it did not
        // ask for.
        authAccounts: { select: { provider: true } }
      }
    });

    // AUTH-003 / AUTH-006 — one address, one way in.
    //
    // Reaching here means the address already has an account and this provider
    // account is not on it: the lookup at the top matched on provider and
    // account id and found nothing. So there is no session to resume, only a
    // second door to open on an account that already has one.
    //
    // This used to link silently whenever the provider had verified the
    // address, which was safe — Google will not vouch for an address you do
    // not own — but not expected: the account someone thought they were
    // creating turned out to be one they already had, now reachable a way
    // they never set up. The local side already refuses the mirror image of
    // this ("Email is already registered" in auth.service.ts), so both halves
    // now say the same thing.
    if (existing) {
      this.logger.warn(
        `Refused ${profile.provider} sign-in for an address that already has an account`
      );
      throw new ConflictException(refusalFor(profile.provider, existing));
    }

    const providerName = clampName(profile.displayName);

    const created = await this.prisma.user.create({
      data: {
        email,
        // No password: this account signs in through the provider. AUTH-002
        // already refuses a local login when passwordHash is null.
        emailVerifiedAt: profile.emailVerified ? new Date() : null,
        authAccounts: {
          create: {
            provider: profile.provider,
            providerAccountId: profile.providerAccountId
          }
        },
        profile: {
          create: {
            firstName: providerName ?? nameFromEmail(email),
            displayName: providerName ?? nameFromEmail(email)
          }
        }
      },
      select: { id: true, email: true, role: true, status: true }
    });

    this.logger.log(`Created user ${created.id} from ${profile.provider}`);

    return this.asResolved(created);
  }

  private asResolved(user: ResolvedAccount): AccountResolution {
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active');
    }
    return { outcome: 'RESOLVED', user };
  }
}
