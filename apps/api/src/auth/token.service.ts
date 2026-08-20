import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { EnvVariable } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import type { UserRole } from '../../generated/prisma/enums';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
};

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvVariable, true>
  ) {}

  /**
   * AUTH-002 / AUTH-004 — issue an access token and open a refresh session.
   *
   * The refresh token is a random 256-bit string, not a JWT: it has no claims
   * to read, and only its SHA-256 digest is stored, so a database leak cannot
   * be replayed. SHA-256 rather than bcrypt because the token already carries
   * full entropy and refresh runs on every expiry — there is nothing to slow
   * a guesser down for.
   */
  async issue(user: {
    id: string;
    email: string;
    role: UserRole;
  }): Promise<IssuedTokens> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true })
    });

    const refreshToken = randomBytes(32).toString('base64url');

    await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        expiresAt: this.refreshExpiry()
      }
    });

    return { accessToken, refreshToken };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Revokes every live session for a user — used after a password reset. */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  private refreshExpiry(): Date {
    const ttl = this.config.get('JWT_REFRESH_TTL', { infer: true });
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) {
      throw new Error(
        `JWT_REFRESH_TTL must look like "7d", "24h", "30m" or "60s", got "${ttl}"`
      );
    }

    const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    const amount = Number(match[1]);
    const unit = match[2] as keyof typeof unitMs;

    return new Date(Date.now() + amount * unitMs[unit]);
  }
}
