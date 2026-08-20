import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenGuard } from './access-token.guard';

const SECRET = 'test-secret-that-is-long-enough-to-pass';

const activeUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'somchai@example.com',
  role: 'USER',
  status: 'ACTIVE'
};

/** Minimal ExecutionContext carrying one request. */
const contextFor = (request: Partial<Request>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined
  }) as unknown as ExecutionContext;

const requestWith = (authorization?: string): Partial<Request> => ({
  header: ((name: string) =>
    name.toLowerCase() === 'authorization'
      ? authorization
      : undefined) as Request['header']
});

describe('AccessTokenGuard (AUTH-008)', () => {
  let guard: AccessTokenGuard;
  let jwt: JwtService;
  let reflector: { getAllAndOverride: jest.Mock };
  let prisma: { user: { findUnique: jest.Mock } };

  const tokenFor = (
    sub: string,
    options: { expiresIn?: JwtSignOptions['expiresIn'] } = {}
  ) =>
    jwt.sign(
      { sub },
      { secret: SECRET, expiresIn: options.expiresIn ?? '15m' }
    );

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn().mockResolvedValue(activeUser) } };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AccessTokenGuard,
        JwtService,
        { provide: PrismaService, useValue: prisma },
        { provide: Reflector, useValue: reflector },
        {
          provide: ConfigService,
          useValue: { get: () => SECRET }
        }
      ]
    }).compile();

    guard = moduleRef.get(AccessTokenGuard);
    jwt = moduleRef.get(JwtService);
  });

  describe('protected routes', () => {
    it('accepts a valid token and attaches the user', async () => {
      const request = requestWith(`Bearer ${tokenFor(activeUser.id)}`);

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(request.user).toEqual(activeUser);
    });

    it('reads the account fresh rather than trusting the claims', async () => {
      const request = requestWith(`Bearer ${tokenFor(activeUser.id)}`);

      await guard.canActivate(contextFor(request));

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: activeUser.id } })
      );
    });

    it('rejects a request with no Authorization header', async () => {
      await expect(
        guard.canActivate(contextFor(requestWith(undefined)))
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a non-bearer scheme', async () => {
      await expect(
        guard.canActivate(contextFor(requestWith('Basic abc123')))
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a token signed with the wrong secret', async () => {
      const forged = jwt.sign(
        { sub: activeUser.id },
        { secret: 'a-different-secret-of-adequate-length', expiresIn: '15m' }
      );

      await expect(
        guard.canActivate(contextFor(requestWith(`Bearer ${forged}`)))
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an expired token', async () => {
      const expired = jwt.sign(
        { sub: activeUser.id },
        { secret: SECRET, expiresIn: '-1s' }
      );

      await expect(
        guard.canActivate(contextFor(requestWith(`Bearer ${expired}`)))
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a token whose user no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        guard.canActivate(
          contextFor(requestWith(`Bearer ${tokenFor(activeUser.id)}`))
        )
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('locks out a suspended account immediately (ADM-002)', async () => {
      // Still holding a valid, unexpired token from before the suspension.
      prisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        status: 'SUSPENDED'
      });

      await expect(
        guard.canActivate(
          contextFor(requestWith(`Bearer ${tokenFor(activeUser.id)}`))
        )
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('public routes', () => {
    beforeEach(() => reflector.getAllAndOverride.mockReturnValue(true));

    it('lets an anonymous visitor through', async () => {
      const request = requestWith(undefined);

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(request.user).toBeUndefined();
    });

    it('still identifies a signed-in reader', async () => {
      const request = requestWith(`Bearer ${tokenFor(activeUser.id)}`);

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(request.user).toEqual(activeUser);
    });

    it('treats a bad token as anonymous instead of failing the page', async () => {
      const request = requestWith('Bearer not-a-real-token');

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(request.user).toBeUndefined();
    });

    it('treats a suspended account as an anonymous visitor', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        status: 'SUSPENDED'
      });
      const request = requestWith(`Bearer ${tokenFor(activeUser.id)}`);

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(request.user).toBeUndefined();
    });
  });
});
