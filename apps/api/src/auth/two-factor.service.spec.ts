import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { HashingService } from './hashing.service';
import { TwoFactorService } from './two-factor.service';

const env: Record<string, unknown> = {
  OTP_TTL_MINUTES: 10,
  OTP_RESEND_COOLDOWN_SECONDS: 60
};

/** Arguments the service passes on, typed so the assertions stay type-safe. */
type SendArgs = [to: string, code: string, ttlMinutes: number];
type CreateArgs = [{ data: { codeHash: string; expiresAt: Date } }];
type UpdateArgs = [
  { where: { userId: string; used: boolean }; data: { used: boolean } }
];
type FindFirstArgs = [{ where: { used: boolean; expiresAt: { gt: Date } } }];

describe('TwoFactorService (AUTH-007)', () => {
  let service: TwoFactorService;
  let hashing: HashingService;
  let mail: { sendTwoFactorCode: jest.Mock };
  let prisma: {
    twoFactorCode: {
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      twoFactorCode: {
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn()
      },
      $transaction: jest.fn().mockResolvedValue([])
    };
    mail = { sendTwoFactorCode: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        HashingService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } }
      ]
    }).compile();

    service = moduleRef.get(TwoFactorService);
    hashing = moduleRef.get(HashingService);
  });

  describe('issue', () => {
    it('mails a six-digit code', async () => {
      await service.issue({ id: 'u1', email: 'a@example.com' });

      const [to, code, ttl] = (
        mail.sendTwoFactorCode.mock.calls as SendArgs[]
      )[0];
      expect(to).toBe('a@example.com');
      expect(code).toMatch(/^\d{6}$/);
      expect(ttl).toBe(10);
    });

    it('stores only a hash of the code, never the code itself', async () => {
      await service.issue({ id: 'u1', email: 'a@example.com' });

      const [, code] = (mail.sendTwoFactorCode.mock.calls as SendArgs[])[0];
      const [createArg] = (
        prisma.twoFactorCode.create.mock.calls as CreateArgs[]
      )[0];
      expect(createArg.data.codeHash).not.toBe(code);
      expect(await hashing.compare(code, createArg.data.codeHash)).toBe(true);
    });

    it('burns any earlier unused code so only the newest one works', async () => {
      await service.issue({ id: 'u1', email: 'a@example.com' });

      const [updateArg] = (
        prisma.twoFactorCode.updateMany.mock.calls as UpdateArgs[]
      )[0];
      expect(updateArg.where).toEqual({ userId: 'u1', used: false });
      expect(updateArg.data).toEqual({ used: true });
      // Both writes go through one transaction, so a crash cannot leave two
      // live codes behind.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    /**
     * The code is in the database before the mail is handed over, so the
     * sign-in has already succeeded by the time the relay is involved. A relay
     * that is down or slow must not turn that into a failed login: the person
     * would be told to try again while a perfectly good code sat in their
     * inbox, or in the queue behind whatever was stuck.
     *
     * MailService logs the failure with a stack — that is where a delivery
     * problem is meant to surface, not in the caller's response.
     */
    it('answers even when the relay refuses the message', async () => {
      mail.sendTwoFactorCode.mockRejectedValue(new Error('smtp is down'));

      await expect(
        service.issue({ id: 'u1', email: 'a@example.com' })
      ).resolves.toBeUndefined();
    });

    // Handed over, not waited on: a relay that never settles must not hold the
    // response open behind it.
    it('does not wait for the relay to finish', async () => {
      let deliver: () => void = () => undefined;
      mail.sendTwoFactorCode.mockReturnValue(
        new Promise<void>((resolve) => {
          deliver = resolve;
        })
      );

      await expect(
        service.issue({ id: 'u1', email: 'a@example.com' })
      ).resolves.toBeUndefined();

      expect(mail.sendTwoFactorCode).toHaveBeenCalled();
      deliver();
    });

    it('sets the expiry from OTP_TTL_MINUTES', async () => {
      const before = Date.now();
      await service.issue({ id: 'u1', email: 'a@example.com' });

      const [createArg] = (
        prisma.twoFactorCode.create.mock.calls as CreateArgs[]
      )[0];
      const ms = createArg.data.expiresAt.getTime() - before;
      expect(ms).toBeGreaterThan(9 * 60_000);
      expect(ms).toBeLessThanOrEqual(10 * 60_000 + 1000);
    });
  });

  describe('consume', () => {
    const liveCode = async (code: string) => ({
      id: 'code-1',
      codeHash: await hashing.hash(code),
      used: false,
      expiresAt: new Date(Date.now() + 60_000)
    });

    it('accepts the right code exactly once', async () => {
      prisma.twoFactorCode.findFirst.mockResolvedValue(
        await liveCode('123456')
      );
      prisma.twoFactorCode.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.consume('u1', '123456')).resolves.toBe(true);
    });

    it('rejects a wrong code', async () => {
      prisma.twoFactorCode.findFirst.mockResolvedValue(
        await liveCode('123456')
      );

      await expect(service.consume('u1', '000000')).resolves.toBe(false);
      expect(prisma.twoFactorCode.updateMany).not.toHaveBeenCalled();
    });

    it('rejects when no live code is left (expired or already used)', async () => {
      prisma.twoFactorCode.findFirst.mockResolvedValue(null);

      await expect(service.consume('u1', '123456')).resolves.toBe(false);
    });

    it('only queries codes that are unused and unexpired', async () => {
      prisma.twoFactorCode.findFirst.mockResolvedValue(null);

      await service.consume('u1', '123456');

      const [{ where }] = (
        prisma.twoFactorCode.findFirst.mock.calls as FindFirstArgs[]
      )[0];
      expect(where.used).toBe(false);
      expect(where.expiresAt.gt).toBeInstanceOf(Date);
    });

    it('lets only one of two racing redemptions win', async () => {
      prisma.twoFactorCode.findFirst.mockResolvedValue(
        await liveCode('123456')
      );
      // The loser's guarded update matches zero rows.
      prisma.twoFactorCode.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.consume('u1', '123456')).resolves.toBe(false);
    });
  });

  describe('checkCooldown', () => {
    it('is open when no code was ever sent', async () => {
      prisma.twoFactorCode.findFirst.mockResolvedValue(null);

      await expect(service.checkCooldown('u1')).resolves.toEqual({
        blocked: false,
        retryAfterSeconds: 0
      });
    });

    it('blocks and reports the wait right after a send', async () => {
      prisma.twoFactorCode.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 10_000)
      });

      const state = await service.checkCooldown('u1');
      expect(state.blocked).toBe(true);
      expect(state.retryAfterSeconds).toBeGreaterThan(45);
      expect(state.retryAfterSeconds).toBeLessThanOrEqual(50);
    });

    it('opens again once the cooldown has passed', async () => {
      prisma.twoFactorCode.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 61_000)
      });

      await expect(service.checkCooldown('u1')).resolves.toEqual({
        blocked: false,
        retryAfterSeconds: 0
      });
    });
  });
});
