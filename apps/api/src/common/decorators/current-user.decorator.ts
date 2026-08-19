import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user.type';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();

    if (!request.user) {
      throw new Error(
        'CurrentUser ใช้ไม่ได้เพราะ route นี้ถูก mark เป็น @Public() (ไม่มี auth guard ทำงาน)',
      );
    }

    return request.user;
  },
);
