import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { HashingService } from './hashing.service';

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
    user: { findUnique: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn(), create: jest.fn() } };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        HashingService,
        { provide: PrismaService, useValue: prisma }
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
});
