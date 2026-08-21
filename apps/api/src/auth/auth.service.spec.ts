import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { HashingService } from './hashing.service';
import { TokenService } from './token.service';
import { TwoFactorService } from './two-factor.service';

const validDto = (): RegisterDto => ({
  email: 'somchai@example.com',
  password: 'Str0ngPassw0rd',
  firstName: 'สมชาย',
  lastName: 'ใจดี',
  displayName: 'somchai'
});

/** Shape of the argument AuthService hands to prisma.user.create. */
type CreateArgs = {
  data: {
    email: string;
    passwordHash: string;
    password?: never;
    profile: {
      create: {
        firstName: string;
        lastName: string | null;
        displayName: string;
      };
    };
  };
};

const createdRow = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'somchai@example.com',
  role: 'USER',
  status: 'ACTIVE',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  profile: { firstName: 'สมชาย', lastName: 'ใจดี', displayName: 'somchai' }
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let twoFactor: {
    ttlMinutes: number;
    cooldownSeconds: number;
    checkCooldown: jest.Mock;
    issue: jest.Mock;
    consume: jest.Mock;
  };
  let tokens: {
    issue: jest.Mock;
    lookupRefreshToken: jest.Mock;
    rotate: jest.Mock;
    revokeSession: jest.Mock;
    revokeAllSessions: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() }
    };
    twoFactor = {
      ttlMinutes: 10,
      cooldownSeconds: 60,
      checkCooldown: jest
        .fn()
        .mockResolvedValue({ blocked: false, retryAfterSeconds: 0 }),
      issue: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn().mockResolvedValue(true)
    };
    tokens = {
      issue: jest
        .fn()
        .mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' }),
      lookupRefreshToken: jest.fn(),
      rotate: jest.fn().mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh'
      }),
      revokeSession: jest.fn().mockResolvedValue(undefined),
      revokeAllSessions: jest.fn().mockResolvedValue(undefined)
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        HashingService,
        { provide: PrismaService, useValue: prisma },
        { provide: TwoFactorService, useValue: twoFactor },
        { provide: TokenService, useValue: tokens }
      ]
    }).compile();

    service = moduleRef.get(AuthService);
  });

  /** The single create call AuthService made, typed rather than `any`. */
  const createArgs = (): CreateArgs =>
    (prisma.user.create.mock.calls as CreateArgs[][])[0][0];

  describe('register (AUTH-001)', () => {
    it('stores a bcrypt hash rather than the raw password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(createdRow);

      await service.register(validDto());

      const { data } = createArgs();
      expect(data.passwordHash).not.toBe('Str0ngPassw0rd');
      expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(data).not.toHaveProperty('password');
    });

    it('creates the profile in the same nested write as the user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(createdRow);

      await service.register(validDto());

      const { data } = createArgs();
      expect(data.profile.create).toEqual({
        firstName: 'สมชาย',
        lastName: 'ใจดี',
        displayName: 'somchai'
      });
    });

    it('stores a null last name when it is omitted', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        ...createdRow,
        profile: { ...createdRow.profile, lastName: null }
      });

      const dto = validDto();
      delete dto.lastName;
      await service.register(dto);

      const { data } = createArgs();
      expect(data.profile.create.lastName).toBeNull();
    });

    it('never returns the password hash to the caller', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(createdRow);

      const result = await service.register(validDto());

      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe('somchai@example.com');
      expect(result.displayName).toBe('somchai');
    });

    it('rejects an email that is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(service.register(validDto())).rejects.toBeInstanceOf(
        ConflictException
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('turns a racing unique violation into a conflict', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.register(validDto())).rejects.toBeInstanceOf(
        ConflictException
      );
    });

    it('lets unrelated database errors bubble up untouched', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(new Error('connection lost'));

      await expect(service.register(validDto())).rejects.toThrow(
        'connection lost'
      );
    });
  });

  describe('login (AUTH-002 step one)', () => {
    const credentials = {
      email: 'somchai@example.com',
      password: 'Str0ngPassw0rd'
    };

    /** Seeds prisma with an account whose stored hash matches `password`. */
    const seedAccount = async (overrides: Record<string, unknown> = {}) => {
      const hashing = new HashingService();
      prisma.user.findUnique.mockResolvedValue({
        ...createdRow,
        passwordHash: await hashing.hash('Str0ngPassw0rd'),
        ...overrides
      });
    };

    it('mails a code and returns a pending status without any token', async () => {
      await seedAccount();

      const result = await service.login(credentials);

      expect(twoFactor.issue).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        status: 'PENDING_2FA',
        expiresInMinutes: 10,
        resendAfterSeconds: 60
      });
      expect(result).not.toHaveProperty('accessToken');
      expect(tokens.issue).not.toHaveBeenCalled();
    });

    it('rejects a wrong password without sending anything', async () => {
      await seedAccount();

      await expect(
        service.login({ ...credentials, password: 'WrongPassw0rd' })
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(twoFactor.issue).not.toHaveBeenCalled();
    });

    it('rejects an unknown email with the same error as a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(credentials)).rejects.toBeInstanceOf(
        UnauthorizedException
      );
    });

    it('rejects an OAuth-only account that has no password set', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...createdRow,
        passwordHash: null
      });

      await expect(service.login(credentials)).rejects.toBeInstanceOf(
        UnauthorizedException
      );
    });

    it('turns a suspended account away at step one', async () => {
      await seedAccount({ status: 'SUSPENDED' });

      await expect(service.login(credentials)).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(twoFactor.issue).not.toHaveBeenCalled();
    });

    it('does not mail a second code while the cooldown is running', async () => {
      await seedAccount();
      twoFactor.checkCooldown.mockResolvedValue({
        blocked: true,
        retryAfterSeconds: 42
      });

      const result = await service.login(credentials);

      expect(twoFactor.issue).not.toHaveBeenCalled();
      expect(result.resendAfterSeconds).toBe(42);
    });
  });

  describe('verifyTwoFactor (AUTH-002 step two / AUTH-007)', () => {
    const credentials = {
      email: 'somchai@example.com',
      password: 'Str0ngPassw0rd',
      otp: '123456'
    };

    const seedAccount = async () => {
      const hashing = new HashingService();
      prisma.user.findUnique.mockResolvedValue({
        ...createdRow,
        passwordHash: await hashing.hash('Str0ngPassw0rd')
      });
      prisma.user.update.mockResolvedValue(createdRow);
    };

    it('issues tokens once the code checks out', async () => {
      await seedAccount();

      const result = await service.verifyTwoFactor(credentials);

      expect(twoFactor.consume).toHaveBeenCalledWith(createdRow.id, '123456');
      expect(result.accessToken).toBe('access');
      expect(result.refreshToken).toBe('refresh');
      expect(result.user.email).toBe('somchai@example.com');
    });

    it('never returns the password hash alongside the tokens', async () => {
      await seedAccount();

      const result = await service.verifyTwoFactor(credentials);

      expect(result.user).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(result)).not.toContain('$2');
    });

    it('refuses a bad code and issues nothing', async () => {
      await seedAccount();
      twoFactor.consume.mockResolvedValue(false);

      await expect(service.verifyTwoFactor(credentials)).rejects.toBeInstanceOf(
        UnauthorizedException
      );
      expect(tokens.issue).not.toHaveBeenCalled();
    });

    it('checks the password again, so a leaked code alone is useless', async () => {
      await seedAccount();

      await expect(
        service.verifyTwoFactor({ ...credentials, password: 'WrongPassw0rd' })
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(twoFactor.consume).not.toHaveBeenCalled();
    });

    it('records the successful sign-in time', async () => {
      await seedAccount();

      await service.verifyTwoFactor(credentials);

      const [updateArg] = (
        prisma.user.update.mock.calls as [{ data: { lastLoginAt: Date } }][]
      )[0];
      expect(updateArg.data.lastLoginAt).toBeInstanceOf(Date);
    });
  });

  describe('resendTwoFactor (AUTH-007)', () => {
    const credentials = {
      email: 'somchai@example.com',
      password: 'Str0ngPassw0rd'
    };

    const seedAccount = async () => {
      const hashing = new HashingService();
      prisma.user.findUnique.mockResolvedValue({
        ...createdRow,
        passwordHash: await hashing.hash('Str0ngPassw0rd')
      });
    };

    it('sends a fresh code when the cooldown is open', async () => {
      await seedAccount();

      await service.resendTwoFactor(credentials);

      expect(twoFactor.issue).toHaveBeenCalledTimes(1);
    });

    it('answers 429 with the remaining wait while cooling down', async () => {
      await seedAccount();
      twoFactor.checkCooldown.mockResolvedValue({
        blocked: true,
        retryAfterSeconds: 37
      });

      await expect(service.resendTwoFactor(credentials)).rejects.toMatchObject({
        status: 429
      });
      expect(twoFactor.issue).not.toHaveBeenCalled();
    });
  });

  describe('refresh (AUTH-004)', () => {
    const dto = { refreshToken: 'a-refresh-token-long-enough' };
    const owner = {
      id: createdRow.id,
      email: createdRow.email,
      role: 'USER',
      status: 'ACTIVE'
    };

    it('rotates the session and returns a different token', async () => {
      tokens.lookupRefreshToken.mockResolvedValue({
        outcome: 'VALID',
        sessionId: 's1',
        user: owner
      });
      prisma.user.findUnique.mockResolvedValue(createdRow);

      const result = await service.refresh(dto);

      expect(tokens.rotate).toHaveBeenCalledWith('s1', owner);
      expect(result.refreshToken).toBe('new-refresh');
      expect(result.refreshToken).not.toBe(dto.refreshToken);
    });

    it('cuts every session when a spent token is replayed', async () => {
      tokens.lookupRefreshToken.mockResolvedValue({
        outcome: 'REPLAYED',
        sessionId: 's1',
        user: owner
      });

      await expect(service.refresh(dto)).rejects.toBeInstanceOf(
        UnauthorizedException
      );
      expect(tokens.revokeAllSessions).toHaveBeenCalledWith(owner.id);
      expect(tokens.rotate).not.toHaveBeenCalled();
    });

    it('rejects an unknown token without touching any session', async () => {
      tokens.lookupRefreshToken.mockResolvedValue({ outcome: 'UNKNOWN' });

      await expect(service.refresh(dto)).rejects.toBeInstanceOf(
        UnauthorizedException
      );
      expect(tokens.revokeAllSessions).not.toHaveBeenCalled();
      expect(tokens.rotate).not.toHaveBeenCalled();
    });

    it('rejects an expired token the same way as an unknown one', async () => {
      tokens.lookupRefreshToken.mockResolvedValue({
        outcome: 'EXPIRED',
        sessionId: 's1'
      });

      await expect(service.refresh(dto)).rejects.toBeInstanceOf(
        UnauthorizedException
      );
      expect(tokens.rotate).not.toHaveBeenCalled();
    });

    it('refuses to refresh a suspended account', async () => {
      tokens.lookupRefreshToken.mockResolvedValue({
        outcome: 'VALID',
        sessionId: 's1',
        user: { ...owner, status: 'SUSPENDED' }
      });

      await expect(service.refresh(dto)).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(tokens.rotate).not.toHaveBeenCalled();
    });
  });

  describe('logout (AUTH-004)', () => {
    const dto = { refreshToken: 'a-refresh-token-long-enough' };

    it('revokes the matching session', async () => {
      tokens.lookupRefreshToken.mockResolvedValue({
        outcome: 'VALID',
        sessionId: 's1',
        user: { id: 'u1', email: 'a@b.c', role: 'USER', status: 'ACTIVE' }
      });

      await service.logout(dto);

      expect(tokens.revokeSession).toHaveBeenCalledWith('s1');
    });

    it('still revokes a session whose token had expired', async () => {
      tokens.lookupRefreshToken.mockResolvedValue({
        outcome: 'EXPIRED',
        sessionId: 's1'
      });

      await service.logout(dto);

      expect(tokens.revokeSession).toHaveBeenCalledWith('s1');
    });

    it('stays quiet for a token that never existed', async () => {
      tokens.lookupRefreshToken.mockResolvedValue({ outcome: 'UNKNOWN' });

      await expect(service.logout(dto)).resolves.toBeUndefined();
      expect(tokens.revokeSession).not.toHaveBeenCalled();
    });
  });
});
