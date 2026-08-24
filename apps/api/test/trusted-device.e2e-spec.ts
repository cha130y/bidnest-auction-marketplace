import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * AUTH-007 — "ask for a code the first time, then remember the browser."
 *
 * Worth doing end to end rather than in the service tests because of the
 * inbox: the only way to show that a login skipped the code is to show that no
 * mail arrived, and that needs real Maildev and a real count of what it holds.
 *
 * The full first login runs exactly once, in beforeAll. Repeating it would run
 * into the resend cooldown, which suppresses the second code and leaves the
 * inbox holding one that has already been spent — a test failure that would
 * say nothing about trusted devices. Cases that need a device in a particular
 * state seed the row directly instead; how a row is minted is already covered
 * by that one real login.
 */
describe('Trusted devices (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const email = `device-e2e-${Date.now()}@example.com`;
  const password = 'Str0ngPassw0rd';
  const maildev = 'http://localhost:1080';

  /** The device token minted by the one real login. */
  let deviceToken: string;
  let userId: string;

  const digest = (token: string) =>
    createHash('sha256').update(token).digest('hex');

  /** How many codes this address has been sent so far. */
  const mailCount = async (): Promise<number> => {
    const messages = (await (await fetch(`${maildev}/api/email`)).json()) as {
      subject: string;
      to: { address: string }[];
    }[];
    return messages.filter(
      (m) =>
        m.to.some((t) => t.address === email) &&
        m.subject.includes('รหัสยืนยัน')
    ).length;
  };

  const readOtp = async (): Promise<string> => {
    const messages = (await (await fetch(`${maildev}/api/email`)).json()) as {
      subject: string;
      text: string;
      to: { address: string }[];
      time: string;
    }[];
    const mine = messages
      .filter((m) => m.to.some((t) => t.address === email))
      .filter((m) => m.subject.includes('รหัสยืนยัน'))
      .sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
    const match = /\b(\d{6})\b/.exec(mine[0]?.text ?? '');
    if (!match) throw new Error('No OTP found in the delivered mail');
    return match[1];
  };

  /** A device row in whatever state a test needs, without the mail round trip. */
  const seedDevice = async (
    overrides: Partial<{ expiresAt: Date; revokedAt: Date | null }> = {}
  ): Promise<string> => {
    const token = randomBytes(32).toString('hex');
    await prisma.trustedDevice.create({
      data: {
        userId,
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides
      }
    });
    return token;
  };

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = configureApp(
      moduleFixture.createNestApplication()
    ) as INestApplication<App>;
    await app.init();
    prisma = app.get(PrismaService);

    await request(server())
      .post('/auth/register')
      .send({ email, password, firstName: 'Device', displayName: 'device-e2e' })
      .expect(201);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true }
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  describe('the first time, from a browser nobody has seen', () => {
    it('still asks for a code, and mails one', async () => {
      const before = await mailCount();

      const response = await request(server())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      expect(response.body).toMatchObject({ status: 'PENDING_2FA' });
      expect(response.body).not.toHaveProperty('accessToken');
      expect(await mailCount()).toBe(before + 1);
    });

    it('hands back a device token when the code is answered', async () => {
      const otp = await readOtp();

      const response = await request(server())
        .post('/auth/2fa/verify')
        .send({
          email,
          password,
          otp,
          rememberDevice: true,
          deviceLabel: 'Chrome on Windows'
        })
        .expect(200);

      const body = response.body as {
        accessToken: string;
        deviceToken?: string;
      };
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.deviceToken).toEqual(expect.stringMatching(/^[0-9a-f]{64}$/));

      deviceToken = body.deviceToken!;
    });

    it('kept only the digest, never the token itself', async () => {
      const rows = await prisma.trustedDevice.findMany({
        where: { userId },
        select: { tokenHash: true, label: true }
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash).not.toBe(deviceToken);
      expect(rows[0].tokenHash).toBe(digest(deviceToken));
      expect(rows[0].label).toBe('Chrome on Windows');
    });
  });

  describe('afterwards, from the same browser', () => {
    it('signs in with no code, and no mail sent at all', async () => {
      const before = await mailCount();

      const response = await request(server())
        .post('/auth/login')
        .send({ email, password, deviceToken })
        .expect(200);

      const body = response.body as {
        accessToken: string;
        refreshToken: string;
      };
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.refreshToken).toEqual(expect.any(String));
      expect(response.body).not.toHaveProperty('status');
      // The assertion this whole file exists for: a code that was never sent
      // is a code the user never had to go and read.
      expect(await mailCount()).toBe(before);
    });

    it('opens a refresh session exactly as the long way does', async () => {
      const response = await request(server())
        .post('/auth/login')
        .send({ email, password, deviceToken })
        .expect(200);

      const { refreshToken } = response.body as { refreshToken: string };
      await request(server())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);
    });

    it('still refuses a wrong password', async () => {
      // The device stands in for the second factor, never the first.
      await request(server())
        .post('/auth/login')
        .send({ email, password: 'WrongPassw0rd', deviceToken })
        .expect(401);
    });

    it('moves lastUsedAt, so an unused device stays tellable apart', async () => {
      const before = await prisma.trustedDevice.findFirstOrThrow({
        where: { userId },
        select: { id: true, lastUsedAt: true }
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      await request(server())
        .post('/auth/login')
        .send({ email, password, deviceToken })
        .expect(200);

      const after = await prisma.trustedDevice.findUniqueOrThrow({
        where: { id: before.id },
        select: { lastUsedAt: true }
      });
      expect(after.lastUsedAt.getTime()).toBeGreaterThan(
        before.lastUsedAt.getTime()
      );
    });
  });

  describe('a token that should not work', () => {
    it('falls back to the code for one nobody issued', async () => {
      const response = await request(server())
        .post('/auth/login')
        .send({ email, password, deviceToken: 'f'.repeat(64) })
        .expect(200);

      expect(response.body).toMatchObject({ status: 'PENDING_2FA' });
    });

    it('rejects one that is not even the right shape', async () => {
      await request(server())
        .post('/auth/login')
        .send({ email, password, deviceToken: 'not-a-token' })
        .expect(400);
    });

    it('ignores an expired one', async () => {
      const stale = await seedDevice({
        expiresAt: new Date(Date.now() - 1000)
      });

      const response = await request(server())
        .post('/auth/login')
        .send({ email, password, deviceToken: stale })
        .expect(200);

      expect(response.body).toMatchObject({ status: 'PENDING_2FA' });
    });

    it('ignores a revoked one', async () => {
      const revoked = await seedDevice({ revokedAt: new Date() });

      const response = await request(server())
        .post('/auth/login')
        .send({ email, password, deviceToken: revoked })
        .expect(200);

      expect(response.body).toMatchObject({ status: 'PENDING_2FA' });
    });

    it('will not open a different account', async () => {
      // The row is matched on the user as well as the digest, so a real token
      // belonging to somebody else opens nothing here.
      const other = `device-other-${Date.now()}@example.com`;
      await request(server())
        .post('/auth/register')
        .send({
          email: other,
          password,
          firstName: 'Other',
          displayName: 'other-e2e'
        })
        .expect(201);

      const response = await request(server())
        .post('/auth/login')
        .send({ email: other, password, deviceToken })
        .expect(200);

      expect(response.body).toMatchObject({ status: 'PENDING_2FA' });

      await prisma.user.deleteMany({ where: { email: other } });
    });
  });

  describe('after a password reset (AUTH-005)', () => {
    it('stops trusting every browser the account had trusted', async () => {
      await request(server())
        .post('/auth/forgot-password')
        // 202: the same answer whether or not the address is known (AUTH-005).
        .send({ email })
        .expect(202);

      const messages = (await (await fetch(`${maildev}/api/email`)).json()) as {
        subject: string;
        text: string;
        to: { address: string }[];
        time: string;
      }[];
      const link = messages
        .filter((m) => m.to.some((t) => t.address === email))
        .filter((m) => m.subject.includes('ตั้งรหัสผ่านใหม่'))
        .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))[0];
      const match = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(
        link?.text ?? ''
      );
      if (!match) throw new Error('No reset link in the delivered mail');

      await request(server())
        .post('/auth/reset-password')
        .send({ token: match[1], password: 'N3wPassw0rd' })
        .expect(204);

      // Whoever prompted the reset must not still be walking past the code on
      // a browser the account trusted before it happened.
      const response = await request(server())
        .post('/auth/login')
        .send({ email, password: 'N3wPassw0rd', deviceToken })
        .expect(200);

      expect(response.body).toMatchObject({ status: 'PENDING_2FA' });

      const live = await prisma.trustedDevice.count({
        where: { userId, revokedAt: null }
      });
      expect(live).toBe(0);
    });
  });
});
