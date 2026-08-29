import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from './../../src/prisma/prisma.service';
import { EnvVariable } from './../../src/config/env.validation';

/**
 * Mints a real access token for an existing user and returns it as a ready
 * `Authorization` header value.
 *
 * This replaces the `x-mock-user-id` header the suites used while
 * MockAuthGuard stood in for AUTH-008. Resolve it once per actor in
 * `beforeAll`, then pass the string to `.set('Authorization', …)` so the call
 * sites stay synchronous:
 *
 *   const sellerAuth = await bearerFor(app, sellerId);
 *   await request(server).post('/products').set('Authorization', sellerAuth);
 *
 * No refresh session is opened — this is only the access half, which is all a
 * guard ever looks at.
 */
export async function bearerFor(
  app: INestApplication,
  userId: string
): Promise<string> {
  const prisma = app.get(PrismaService);
  const jwt = app.get(JwtService);
  const config = app.get<ConfigService<EnvVariable, true>>(ConfigService);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true }
  });

  if (!user) {
    throw new Error(`bearerFor: no user with id ${userId}`);
  }

  const token = await jwt.signAsync(
    { sub: user.id, email: user.email, role: user.role },
    {
      secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: config.get('JWT_ACCESS_TTL', { infer: true })
    }
  );

  return `Bearer ${token}`;
}

/**
 * Mints tokens for a whole cast up front and hands back a *synchronous*
 * lookup, so call sites stay one-liners even inside non-async helpers that
 * receive an actor id as a parameter:
 *
 *   authOf = await authRegistry(app, [sellerId, buyerId, adminId]);
 *   ...
 *   .set('Authorization', authOf(userId))
 */
export async function authRegistry(
  app: INestApplication,
  userIds: string[]
): Promise<(userId: string) => string> {
  const headers = new Map<string, string>();
  for (const id of userIds) {
    headers.set(id, await bearerFor(app, id));
  }

  return (userId: string) => {
    const header = headers.get(userId);
    if (!header) {
      throw new Error(`authRegistry: no token minted for user ${userId}`);
    }
    return header;
  };
}
