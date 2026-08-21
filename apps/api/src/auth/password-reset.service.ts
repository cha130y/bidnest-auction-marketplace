import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { EnvVariable } from '../config/env.validation';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

/** Who a presented reset token belongs to, when it is still spendable. */
export type ResetTokenOwner = { tokenId: string; userId: string };

/**
 * AUTH-005 — password recovery by emailed single-use link.
 *
 * The token is a random 256-bit string stored as a SHA-256 digest, the same
 * treatment refresh tokens get: full entropy already, so a slow hash would buy
 * nothing. Section 6 forbids the raw value from ever reaching a log or an API
 * response, so it exists in exactly two places — the email, and the URL the
 * user clicks.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService<EnvVariable, true>
  ) {}

  get ttlMinutes(): number {
    return this.config.get('PASSWORD_RESET_TTL_MINUTES', { infer: true });
  }

  /**
   * Issues a link for an address that has an account. Callers must answer the
   * same way whether or not this did anything (see AuthService.forgotPassword).
   */
  async issue(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, status: true }
    });

    // Minting the token regardless keeps the work — and so the response time —
    // roughly even between an address that exists and one that does not, which
    // is the other half of not leaking who is registered.
    const token = randomBytes(32).toString('base64url');

    // A suspended account gets no link: letting it back in through recovery
    // would undo ADM-002.
    if (!user || user.status !== 'ACTIVE') return;

    await this.prisma.$transaction([
      // Asking again retires the previous link, so only the newest one works.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true }
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hash(token),
          expiresAt: new Date(Date.now() + this.ttlMinutes * 60_000)
        }
      })
    ]);

    // The user id is safe to log; the token is not.
    this.logger.log(`Issued a password reset link for user ${user.id}`);

    await this.mail.sendPasswordResetLink(
      user.email,
      this.buildLink(token),
      this.ttlMinutes
    );
  }

  /**
   * Spends a token, or reports that it was not spendable. Wrong, expired and
   * already-used tokens are indistinguishable to the caller by design.
   */
  async consume(token: string): Promise<ResetTokenOwner | null> {
    const candidate = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: this.hash(token),
        used: false,
        expiresAt: { gt: new Date() }
      },
      select: { id: true, userId: true }
    });

    if (!candidate) return null;

    // The used:false guard makes redemption atomic: of two requests racing on
    // one link, only the one that flips the row wins.
    const claimed = await this.prisma.passwordResetToken.updateMany({
      where: { id: candidate.id, used: false },
      data: { used: true }
    });

    return claimed.count === 1
      ? { tokenId: candidate.id, userId: candidate.userId }
      : null;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildLink(token: string): string {
    const base = this.config.get('WEB_APP_URL', { infer: true });
    return `${base.replace(/\/+$/, '')}/reset-password?token=${token}`;
  }
}
