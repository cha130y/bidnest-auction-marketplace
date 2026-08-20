import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * AUTH-002 + AUTH-007 end to end, against real Postgres and real Maildev.
 * The OTP is never read out of the database — it is pulled back out of the
 * delivered email, which is the only way to prove the whole path works.
 */
describe('Login and 2FA (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const email = `login-e2e-${Date.now()}@example.com`;
  const password = 'Str0ngPassw0rd';
  const maildev = 'http://localhost:1080';

  /** Newest code Maildev holds for this address. */
  const readOtpFromInbox = async (): Promise<string> => {
    const response = await fetch(`${maildev}/api/email`);
    const messages = (await response.json()) as {
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

  const login = () =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = configureApp(
      moduleFixture.createNestApplication()
    ) as INestApplication<App>;
    prisma = app.get(PrismaService);
    await app.init();

    await request(app.getHttpServer()).post('/auth/register').send({
      email,
      password,
      firstName: 'สมชาย',
      displayName: 'somchai-login'
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  describe('POST /auth/login (AUTH-002)', () => {
    it('returns a pending status and no token at all', async () => {
      const response = await login().expect(200);

      expect(response.body).toMatchObject({ status: 'PENDING_2FA' });
      expect(response.body).not.toHaveProperty('accessToken');
      expect(response.body).not.toHaveProperty('refreshToken');
    });

    it('actually delivers a six-digit code to the inbox', async () => {
      await expect(readOtpFromInbox()).resolves.toMatch(/^\d{6}$/);
    });

    it('rejects a wrong password', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'WrongPassw0rd' })
        .expect(401);
    });

    it('rejects an unknown account the same way', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: `nobody-${email}`, password })
        .expect(401);
    });
  });

  describe('POST /auth/2fa/verify (AUTH-007)', () => {
    it('refuses a wrong code', async () => {
      await login();
      const otp = await readOtpFromInbox();
      const wrong = otp === '000000' ? '111111' : '000000';

      await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .send({ email, password, otp: wrong })
        .expect(401);
    });

    it('refuses the right code paired with a wrong password', async () => {
      const otp = await readOtpFromInbox();

      await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .send({ email, password: 'WrongPassw0rd', otp })
        .expect(401);
    });

    it('issues tokens for the right code and opens a refresh session', async () => {
      const otp = await readOtpFromInbox();

      const response = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .send({ email, password, otp })
        .expect(200);

      const body = response.body as {
        accessToken: string;
        refreshToken: string;
        user: { email: string };
      };
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.refreshToken).toEqual(expect.any(String));
      expect(body.user.email).toBe(email);
      expect(JSON.stringify(body)).not.toContain('$2');

      const user = await prisma.user.findUnique({ where: { email } });
      const sessions = await prisma.userSession.findMany({
        where: { userId: user!.id }
      });
      expect(sessions).toHaveLength(1);
      // Only the digest is kept, never the token itself (AUTH-004).
      expect(sessions[0].refreshTokenHash).not.toBe(body.refreshToken);
      expect(user!.lastLoginAt).not.toBeNull();
    });

    it('will not accept the same code a second time', async () => {
      const otp = await readOtpFromInbox();

      await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .send({ email, password, otp })
        .expect(401);
    });

    it('rejects a malformed code before it reaches the service', () => {
      return request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .send({ email, password, otp: '12ab' })
        .expect(400);
    });
  });

  describe('POST /auth/2fa/resend (AUTH-007)', () => {
    it('refuses while the cooldown is still running', async () => {
      await login();

      const response = await request(app.getHttpServer())
        .post('/auth/2fa/resend')
        .send({ email, password })
        .expect(429);

      const body = response.body as { retryAfterSeconds: number };
      expect(body.retryAfterSeconds).toBeGreaterThan(0);
    });
  });
});
