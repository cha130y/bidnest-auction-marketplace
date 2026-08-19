import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user.type';

export const MOCK_USER_HEADER = 'x-mock-user-id';

/**
 * TEMPORARY — stands in for Dev 2's JWT guard (AUTH-008).
 * Identifies the caller from an `x-mock-user-id` header instead of a Bearer
 * token. Swapping in the real guard means replacing this class only: every
 * controller reads the identity through `@CurrentUser()`, never from the header.
 */
@Injectable()
export class MockAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.header(MOCK_USER_HEADER);

    if (!userId) {
      if (isPublic) return true;
      throw new UnauthorizedException(`Missing ${MOCK_USER_HEADER} header`);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, status: true }
    });

    if (!user) {
      if (isPublic) return true;
      throw new UnauthorizedException('Unknown user');
    }

    // ADM-002 — a suspended account cannot transact, but public pages stay
    // readable: it is simply treated as an anonymous visitor there.
    if (user.status !== 'ACTIVE') {
      if (isPublic) return true;
      throw new ForbiddenException('Account is not active');
    }

    request.user = user satisfies AuthenticatedUser;

    return true;
  }
}
