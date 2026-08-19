import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedUser } from '../types/authenticated-user.type';
import { UserRole } from '../../../generated/prisma/enums';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class MockJwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (isPublic) {
      return true;
    }

    const headerRole = request.headers['x-mock-role'];
    const role: UserRole =
      headerRole?.toString().toUpperCase() === 'ADMIN'
        ? UserRole.ADMIN
        : UserRole.USER;

    const headerUserId = request.headers['x-mock-user-id'];

    request.user = {
      id: headerUserId?.toString() ?? '00000000-0000-0000-0000-000000000001',
      role,
    };

    return true;
  }
}
