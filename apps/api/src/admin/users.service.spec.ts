import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HashingService } from '../auth/hashing.service';
import { TokenService } from '../auth/token.service';
import { TrustedDeviceService } from '../auth/trusted-device.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminUsersService } from './users.service';

describe('AdminUsersService', () => {
  const USER_ID = '11111111-1111-4111-8111-111111111111';

  let service: AdminUsersService;
  let prisma: {
    user: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  };
  let hashing: { compare: jest.Mock; hash: jest.Mock };
  let tokens: { revokeAllSessions: jest.Mock };
  let trustedDevices: { revokeAll: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({})
      }
    };
    hashing = {
      compare: jest.fn(),
      hash: jest.fn().mockResolvedValue('new-hash')
    };
    tokens = { revokeAllSessions: jest.fn().mockResolvedValue(undefined) };
    trustedDevices = { revokeAll: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: HashingService, useValue: hashing },
        { provide: TokenService, useValue: tokens },
        { provide: TrustedDeviceService, useValue: trustedDevices }
      ]
    }).compile();

    service = moduleRef.get(AdminUsersService);
  });

  describe('listUsers', () => {
    it('filters by role when asked, alongside status', async () => {
      await service.listUsers({ role: 'ADMIN', status: 'ACTIVE' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'ACTIVE', role: 'ADMIN' }
        })
      );
    });

    it('asks for everyone when no filter is given', async () => {
      await service.listUsers();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });
  });

  describe('changeOwnPassword', () => {
    it('refuses a wrong current password', async () => {
      prisma.user.findUnique.mockResolvedValue({ passwordHash: 'old-hash' });
      hashing.compare.mockResolvedValue(false);

      await expect(
        service.changeOwnPassword(USER_ID, 'wrong', 'N3wPassword')
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses an account with no password set (OAuth-only)', async () => {
      prisma.user.findUnique.mockResolvedValue({ passwordHash: null });

      await expect(
        service.changeOwnPassword(USER_ID, 'whatever', 'N3wPassword')
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(hashing.compare).not.toHaveBeenCalled();
    });

    it('updates the hash and revokes every other session and trusted device', async () => {
      prisma.user.findUnique.mockResolvedValue({ passwordHash: 'old-hash' });
      hashing.compare.mockResolvedValue(true);

      await service.changeOwnPassword(USER_ID, 'correct', 'N3wPassword');

      expect(hashing.hash).toHaveBeenCalledWith('N3wPassword');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { passwordHash: 'new-hash' }
      });
      expect(tokens.revokeAllSessions).toHaveBeenCalledWith(USER_ID);
      expect(trustedDevices.revokeAll).toHaveBeenCalledWith(USER_ID);
    });
  });
});
