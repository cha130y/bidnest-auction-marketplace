import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { EnvVariable } from '../../config/env.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user.type';

type AccessTokenClaims = { sub: string };

/**
 * AUTH-008 — the real access-token guard, replacing the temporary
 * MockAuthGuard. Registered globally, so SRS section 6 holds: every request
 * has its token re-checked by NestJS, no matter what the Next.js middleware
 * decided on the client side.
 *
 * The token is verified *and* the account is re-read on each request. Skipping
 * the read would leave a suspended user working normally until their access
 * token expired, which ADM-002 does not allow — a suspended account has to
 * stop bidding, carting and checking out straight away.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvVariable, true>,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const token = readBearerToken(request);

    // A public route stays readable for signed-out visitors. When a token does
    // come along it is still honoured, so pages that show more to a logged-in
    // reader work without a second endpoint.
    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Missing access token');
    }

    const user = await this.resolveUser(token, isPublic);
    if (!user) return true;

    request.user = user;
    return true;
  }

  /** Returns null only when a bad token is tolerated because the route is public. */
  private async resolveUser(
    token: string,
    isPublic: boolean
  ): Promise<AuthenticatedUser | null> {
    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true })
      });
    } catch {
      // Expired and forged tokens are one answer: never say which it was.
      if (isPublic) return null;
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, email: true, role: true, status: true }
    });

    if (!user) {
      if (isPublic) return null;
      throw new UnauthorizedException('Invalid or expired access token');
    }

    // ADM-002 — a suspended account cannot transact, but public pages stay
    // readable: it is simply treated as an anonymous visitor there.
    if (user.status !== 'ACTIVE') {
      if (isPublic) return null;
      throw new ForbiddenException('Account is not active');
    }

    return user;
  }
}

function readBearerToken(request: Request): string | null {
  const header = request.header('authorization');
  if (!header) return null;

  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
