import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { EnvVariable } from '../config/env.validation';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { HashingService } from './hashing.service';

/** How long the caller must wait before another code may be sent. */
export type CooldownState = { blocked: boolean; retryAfterSeconds: number };

/**
 * AUTH-007 — mandatory email OTP. Applies to every login path: local
 * (AUTH-002), Google (AUTH-003) and Line (AUTH-006), so no provider can skip
 * the second factor.
 */
@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hashing: HashingService,
    private readonly mail: MailService,
    private readonly config: ConfigService<EnvVariable, true>
  ) {}

  get ttlMinutes(): number {
    return this.config.get('OTP_TTL_MINUTES', { infer: true });
  }

  get cooldownSeconds(): number {
    return this.config.get('OTP_RESEND_COOLDOWN_SECONDS', { infer: true });
  }

  /**
   * Returns how long the caller still has to wait, without sending anything.
   * Checked before issuing so a resend loop cannot be used to flood an inbox.
   */
  async checkCooldown(userId: string): Promise<CooldownState> {
    const latest = await this.prisma.twoFactorCode.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    });

    if (!latest) return { blocked: false, retryAfterSeconds: 0 };

    const elapsedSeconds = (Date.now() - latest.createdAt.getTime()) / 1000;
    const remaining = Math.ceil(this.cooldownSeconds - elapsedSeconds);

    return remaining > 0
      ? { blocked: true, retryAfterSeconds: remaining }
      : { blocked: false, retryAfterSeconds: 0 };
  }

  /**
   * Issues a fresh code and mails it. Any earlier unused code is burned first
   * so only the newest one can ever be redeemed.
   */
  async issue(user: { id: string; email: string }): Promise<void> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await this.hashing.hash(code);
    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60_000);

    await this.prisma.$transaction([
      this.prisma.twoFactorCode.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true }
      }),
      this.prisma.twoFactorCode.create({
        data: { userId: user.id, codeHash, expiresAt }
      })
    ]);

    // The code itself never reaches a log — only the fact that one was sent.
    this.logger.log(`Issued a 2FA code for user ${user.id}`);

    await this.mail.sendTwoFactorCode(user.email, code, this.ttlMinutes);
  }

  /**
   * Consumes the newest live code. Returns false for a wrong, expired or
   * already-used code — the caller must not tell the client which it was.
   */
  async consume(userId: string, code: string): Promise<boolean> {
    const candidate = await this.prisma.twoFactorCode.findFirst({
      where: { userId, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' }
    });

    if (!candidate) return false;

    if (!(await this.hashing.compare(code, candidate.codeHash))) return false;

    // updateMany with the used:false guard makes redemption atomic: two
    // requests racing on the same code, only the one that flips the row wins.
    const claimed = await this.prisma.twoFactorCode.updateMany({
      where: { id: candidate.id, used: false },
      data: { used: true }
    });

    return claimed.count === 1;
  }
}
