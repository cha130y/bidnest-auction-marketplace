import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import { TokenService } from './../src/auth/token.service';

/**
 * AUTH-004 end to end against real Postgres and Maildev: sign in for real,
 * then exercise the refresh session that the sign-in opened.
 */
describe('Refresh and logout (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: TokenService;
  let server: App;
  let userId: string;

  const email = `refresh-e2e-${Date.now()}@example.com`;
  const password = 'Str0ngPassw0rd';

  const readOtpFromInbox = async (): Promise<string> => {
    const response = await fetch('http://localhost:1080/api/email');
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

  /**
   * Full sign-in, returning a live refresh token. Usable once per run: a
   * second call would land inside the OTP resend cooldown (AUTH-007) and read
   * back the code it already spent.
   */
  const signIn = async (): Promise<string> => {
    await request(server).post('/auth/login').send({ email, password });
    const otp = await readOtpFromInbox();
    const response = await request(server)
      .post('/auth/2fa/verify')
      .send({ email, password, otp })
      .expect(200);
    return (response.body as { refreshToken: string }).refreshToken;
  };

  /**
   * Opens a session the same way sign-in does, minus the OTP round trip. These
   * tests are about what /auth/refresh does with a session, not about how the
   * session was born — signIn covers that once, above.
   */
  const openSession = async (): Promise<string> => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, role: true }
    });
    return (await tokens.issue(user)).refreshToken;
  };

  const liveSessionCount = async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    return prisma.userSession.count({
      where: { userId: user!.id, revokedAt: null }
    });
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = configureApp(
      moduleFixture.createNestApplication()
    ) as INestApplication<App>;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    await app.init();
    server = app.getHttpServer();

    const created = await request(server).post('/auth/register').send({
      email,
      password,
      firstName: 'สมชาย',
      displayName: 'somchai-refresh'
    });
    userId = (created.body as { id: string }).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  describe('POST /auth/refresh (AUTH-004)', () => {
    it('returns a working new pair and retires the old token', async () => {
      const original = await signIn();

      const response = await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: original })
        .expect(200);

      const body = response.body as {
        accessToken: string;
        refreshToken: string;
        user: { email: string };
      };
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.refreshToken).not.toBe(original);
      expect(body.user.email).toBe(email);

      // The new token works...
      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: body.refreshToken })
        .expect(200);
    });

    it('revokes every session when a spent token comes back', async () => {
      const original = await openSession();
      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: original })
        .expect(200);
      expect(await liveSessionCount()).toBeGreaterThan(0);

      // Replaying the already-spent token looks like theft.
      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: original })
        .expect(401);

      expect(await liveSessionCount()).toBe(0);
    });

    it('rejects a token that was never issued', () => {
      return request(server)
        .post('/auth/refresh')
        .send({ refreshToken: 'n0t-a-real-refresh-token-but-long-enough' })
        .expect(401);
    });

    it('rejects a malformed body before it reaches the service', () => {
      return request(server)
        .post('/auth/refresh')
        .send({ refreshToken: 'short' })
        .expect(400);
    });

    it('stores only a digest, never the token itself', async () => {
      const token = await openSession();
      const user = await prisma.user.findUnique({ where: { email } });
      const sessions = await prisma.userSession.findMany({
        where: { userId: user!.id }
      });

      expect(sessions.length).toBeGreaterThan(0);
      for (const session of sessions) {
        expect(session.refreshTokenHash).not.toBe(token);
        expect(session.refreshTokenHash).toHaveLength(64);
      }
    });
  });

  describe('POST /auth/logout (AUTH-004)', () => {
    it('revokes the session so the token stops working', async () => {
      const token = await openSession();

      await request(server)
        .post('/auth/logout')
        .send({ refreshToken: token })
        .expect(204);

      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: token })
        .expect(401);
    });

    it('answers the same way when called twice', async () => {
      const token = await openSession();

      await request(server)
        .post('/auth/logout')
        .send({ refreshToken: token })
        .expect(204);
      await request(server)
        .post('/auth/logout')
        .send({ refreshToken: token })
        .expect(204);
    });

    it('answers the same way for a token that never existed', () => {
      return request(server)
        .post('/auth/logout')
        .send({ refreshToken: 'n0t-a-real-refresh-token-but-long-enough' })
        .expect(204);
    });
  });
});
