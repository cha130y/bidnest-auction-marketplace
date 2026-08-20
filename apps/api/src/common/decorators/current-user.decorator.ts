import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user.type';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      throw new InternalServerErrorException(
        'CurrentUser used on a route without an auth guard'
      );
    }

    return data ? user[data] : user;
  }
);
