import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger
} from '@nestjs/common';
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

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * AUTH-003 / AUTH-006 — turn a verified provider profile into an account,
   * creating or linking one when this is the first time we have seen it.
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
        id: true,
        email: true,
        role: true,
        status: true,
        authAccounts: {
          where: { provider: profile.provider },
          select: { providerAccountId: true }
        }
      }
    });

    if (existing) {
      // AUTH-003 / AUTH-006 — one provider account per platform account. The
      // unique index says the same thing; this turns it into a clear answer.
      if (existing.authAccounts.length > 0) {
        throw new ConflictException(
          `This account is already linked to a different ${profile.provider} account`
        );
      }

      // Linking on an address the provider vouched for is safe; linking on one
      // the *caller* typed is not, since anyone could type someone else's.
      if (!profile.emailVerified) {
        throw new ConflictException(
          'That address already has an account. Sign in with your password first, then link.'
        );
      }

      await this.prisma.authAccount.create({
        data: {
          userId: existing.id,
          provider: profile.provider,
          providerAccountId: profile.providerAccountId
        }
      });
      this.logger.log(
        `Linked ${profile.provider} to existing user ${existing.id}`
      );

      return this.asResolved(existing);
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
