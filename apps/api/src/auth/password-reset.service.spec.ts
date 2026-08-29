import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordResetService } from './password-reset.service';

const env: Record<string, unknown> = {
  PASSWORD_RESET_TTL_MINUTES: 30,
  WEB_APP_URL: 'http://localhost:3000'
};

type SendArgs = [to: string, link: string, ttlMinutes: number];
type CreateArgs = [{ data: { tokenHash: string; expiresAt: Date } }];

const activeUser = {
  id: 'u1',
  email: 'somchai@example.com',
  status: 'ACTIVE'
};

describe('PasswordResetService (AUTH-005)', () => {
  let service: PasswordResetService;
  let mail: { sendPasswordResetLink: jest.Mock };
  let prisma: {
    user: { findUnique: jest.Mock };
    passwordResetToken: {
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  /** The token as it went out in the mail. */
  const sentToken = (): string => {
    const [, link] = (mail.sendPasswordResetLink.mock.calls as SendArgs[])[0];
    return /token=([A-Za-z0-9_-]+)/.exec(link)![1];
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(activeUser) },
      passwordResetToken: {
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn()
      },
      $transaction: jest.fn().mockResolvedValue([])
    };
    mail = { sendPasswordResetLink: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } }
      ]
    }).compile();

    service = moduleRef.get(PasswordResetService);
  });

  describe('issue', () => {
    it('mails a link built on WEB_APP_URL', async () => {
      await service.issue(activeUser.email);

      const [to, link, ttl] = (
        mail.sendPasswordResetLink.mock.calls as SendArgs[]
      )[0];
      expect(to).toBe(activeUser.email);
      expect(link).toMatch(
        /^http:\/\/localhost:3000\/reset-password\?token=[A-Za-z0-9_-]+$/
      );
      expect(ttl).toBe(30);
    });

    it('stores a digest, never the token that was mailed', async () => {
      await service.issue(activeUser.email);

      const [createArg] = (
        prisma.passwordResetToken.create.mock.calls as CreateArgs[]
      )[0];
      const token = sentToken();
      expect(createArg.data.tokenHash).not.toBe(token);
      expect(createArg.data.tokenHash).toBe(
        createHash('sha256').update(token).digest('hex')
      );
    });

    it('retires any earlier unused link in the same transaction', async () => {
      await service.issue(activeUser.email);

      const updateArg = (
        prisma.passwordResetToken.updateMany.mock.calls as [
          { where: { userId: string; used: boolean }; data: { used: boolean } }
        ][]
      )[0][0];
      expect(updateArg.where).toEqual({ userId: 'u1', used: false });
      expect(updateArg.data).toEqual({ used: true });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('sets the expiry from PASSWORD_RESET_TTL_MINUTES', async () => {
      const before = Date.now();
      await service.issue(activeUser.email);

      const [createArg] = (
        prisma.passwordResetToken.create.mock.calls as CreateArgs[]
      )[0];
      const ms = createArg.data.expiresAt.getTime() - before;
      expect(ms).toBeGreaterThan(29 * 60_000);
      expect(ms).toBeLessThanOrEqual(30 * 60_000 + 1000);
    });

    it('does nothing for an address with no account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.issue('nobody@example.com');

      expect(mail.sendPasswordResetLink).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses to let a suspended account back in (ADM-002)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        status: 'SUSPENDED'
      });

      await service.issue(activeUser.email);

      expect(mail.sendPasswordResetLink).not.toHaveBeenCalled();
    });
  });

  describe('consume', () => {
    it('spends a live token once', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue({
        id: 't1',
        userId: 'u1'
      });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.consume('a-token')).resolves.toEqual({
        tokenId: 't1',
        userId: 'u1'
      });
    });

    it('looks the token up by digest, never by raw value', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue(null);

      await service.consume('a-token');

      const where = (
        prisma.passwordResetToken.findFirst.mock.calls as [
          { where: { tokenHash: string; used: boolean } }
        ][]
      )[0][0].where;
      expect(where.tokenHash).toBe(
        createHash('sha256').update('a-token').digest('hex')
      );
      expect(where.used).toBe(false);
    });

    it('returns nothing for a wrong, expired or already-spent token', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(service.consume('a-token')).resolves.toBeNull();
    });

    it('lets only one of two racing redemptions win', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue({
        id: 't1',
        userId: 'u1'
      });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.consume('a-token')).resolves.toBeNull();
    });
  });
});
