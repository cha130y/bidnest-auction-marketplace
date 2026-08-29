import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { EnvVariable } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import type { UserRole, UserStatus } from '../../generated/prisma/enums';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
};

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
};

export type SessionOwner = {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
};

/** What a presented refresh token turned out to be. */
export type RefreshLookup =
  | { outcome: 'VALID'; sessionId: string; user: SessionOwner }
  | { outcome: 'UNKNOWN' }
  | { outcome: 'EXPIRED'; sessionId: string }
  | { outcome: 'REPLAYED'; sessionId: string; user: SessionOwner };

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
    const accessToken = await this.signAccessToken(user);
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

  /**
   * AUTH-004 — resolve a presented refresh token against user_sessions, which
   * SRS AUTH-004 makes the single source of truth no matter which side reads
   * it. Never says *why* a token failed; the caller answers with one 401.
   */
  async lookupRefreshToken(refreshToken: string): Promise<RefreshLookup> {
    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: this.hashRefreshToken(refreshToken) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: { id: true, email: true, role: true, status: true }
        }
      }
    });

    if (!session) return { outcome: 'UNKNOWN' };

    // A token that was already spent or logged out is showing up again.
    // Either it leaked or the client replayed it; both are worth cutting
    // every session for that account, not just this one.
    if (session.revokedAt) {
      return {
        outcome: 'REPLAYED',
        sessionId: session.id,
        user: session.user
      };
    }

    if (session.expiresAt <= new Date()) {
      return { outcome: 'EXPIRED', sessionId: session.id };
    }

    return { outcome: 'VALID', sessionId: session.id, user: session.user };
  }

  /**
   * AUTH-004 — spend the old session and open a new one atomically, so a
   * crash between the two can never leave both live or both dead.
   *
   * Rotating means a stolen refresh token stops working the moment the real
   * client refreshes: the thief's copy comes back REPLAYED and lookup above
   * takes the whole account's sessions down.
   */
  async rotate(sessionId: string, user: SessionOwner): Promise<IssuedTokens> {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = randomBytes(32).toString('base64url');

    await this.prisma.$transaction([
      this.prisma.userSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() }
      }),
      this.prisma.userSession.create({
        data: {
          userId: user.id,
          refreshTokenHash: this.hashRefreshToken(refreshToken),
          expiresAt: this.refreshExpiry()
        }
      })
    ]);

    return { accessToken, refreshToken };
  }

  /** AUTH-004 — logout. Revoking an already-revoked session is a no-op. */
  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Revokes every live session for a user — after a password reset (AUTH-005)
   * and on refresh-token replay.
   */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  private signAccessToken(user: {
    id: string;
    email: string;
    role: UserRole;
  }): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role
    };

    return this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true })
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
