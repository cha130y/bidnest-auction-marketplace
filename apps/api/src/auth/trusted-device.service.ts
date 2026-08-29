import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { EnvVariable } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';

/**
 * AUTH-007 — browsers this account has already answered a code from.
 *
 * The emailed code stays mandatory the first time an account signs in from a
 * browser. After that, this lets the same browser back in without one, which
 * is the pattern a bank app uses: prove yourself once per device, then be
 * asked again the moment the device changes.
 *
 * What that trades away is worth stating plainly. A stolen password alone is
 * still not enough — the thief is on their own browser, which nobody has
 * trusted, so they meet the code as before. What a trusted device does weaken
 * is the case where the attacker already has the victim's browser, and there
 * the password was the only thing standing there anyway.
 *
 * Only the digest of the token is stored, exactly like a refresh session, so a
 * copy of this table cannot be replayed. SHA-256 rather than bcrypt for the
 * same reason: the token is 256 bits of randomness, so there is no low-entropy
 * guess to slow down.
 */

/** Trimmed hard: enough to tell two rows apart, not enough to profile anyone. */
const LABEL_MAX = 200;

@Injectable()
export class TrustedDeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvVariable, true>
  ) {}

  get ttlDays(): number {
    return this.config.get('TRUSTED_DEVICE_TTL_DAYS', { infer: true });
  }

  private digest(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Is this browser one the account has already proved itself from?
   *
   * A hit also moves `lastUsedAt`, so a device someone keeps using stays
   * distinguishable from one they have not touched since the day they trusted
   * it — which is what a "your devices" screen needs to be useful.
   */
  async isTrusted(userId: string, token: string | undefined): Promise<boolean> {
    if (!token) return false;

    // Matched on the digest *and* the user: a token that is real but belongs to
    // a different account must not open this one.
    const found = await this.prisma.trustedDevice.updateMany({
      where: {
        userId,
        tokenHash: this.digest(token),
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      data: { lastUsedAt: new Date() }
    });

    return found.count > 0;
  }

  /**
   * Remember this browser, and hand back the token it should keep.
   *
   * Called only after a code has actually been answered — trusting a device on
   * anything less would give away the whole point of asking.
   */
  async remember(userId: string, label?: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.trustedDevice.create({
      data: {
        userId,
        tokenHash: this.digest(token),
        label: label?.slice(0, LABEL_MAX) ?? null,
        expiresAt
      }
    });

    return token;
  }

  /**
   * Stop trusting every browser this account has trusted.
   *
   * AUTH-005 calls this after a password reset. Revoking the refresh sessions
   * without revoking these would leave the far longer-lived permission behind:
   * whoever prompted the reset could still sign in from their remembered
   * browser with the new password and never be asked for a code.
   */
  async revokeAll(userId: string): Promise<void> {
    await this.prisma.trustedDevice.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  /** Forgets one browser — "sign out everywhere", or a device the user drops. */
  async revoke(userId: string, token: string): Promise<void> {
    await this.prisma.trustedDevice.updateMany({
      where: { userId, tokenHash: this.digest(token), revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }
}
