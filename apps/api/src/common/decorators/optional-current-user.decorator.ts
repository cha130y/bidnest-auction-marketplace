import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user.type';

/**
 * Like `CurrentUser`, but for a `@Public()` route that still wants to know
 * who's asking when a valid token *was* sent — `AccessTokenGuard` honours one
 * either way. Returns `undefined` for a genuinely signed-out caller instead
 * of throwing, which is the one thing `CurrentUser` cannot do (its whole
 * point is to fail loudly when a guard was forgotten).
 */
export const OptionalCurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) return undefined;
    return data ? user[data] : user;
  }
);
