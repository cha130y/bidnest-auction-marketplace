import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { TokenService } from './../src/auth/token.service';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * AUTH-005 end to end. The reset token is pulled back out of the delivered
 * email rather than the database, so the whole path — issue, mail, click,
 * spend — is what gets exercised.
 */
describe('Password reset (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: TokenService;
  let server: App;
  let userId: string;

  const email = `reset-e2e-${Date.now()}@example.com`;
  const password = 'Str0ngPassw0rd';
  const newPassword = 'N3wStr0ngPass';

  /** Reset mails already counted, so the next read waits for a genuinely new one. */
  let mailsSeen = 0;

  const resetMails = async (): Promise<{ text: string }[]> => {
    const response = await fetch('http://localhost:1080/api/email');
    const messages = (await response.json()) as {
      subject: string;
      text: string;
      to: { address: string }[];
    }[];

    // Maildev keeps insertion order and its timestamps are only
    // second-resolution, so two mails sent back to back cannot be told apart
    // by time. Counting arrivals is the only reliable way to know the newest.
    return messages
      .filter((m) => m.to.some((t) => t.address === email))
      .filter((m) => m.subject.includes('ตั้งรหัสผ่านใหม่'));
  };

  const readResetTokenFromInbox = async (): Promise<string> => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const mine = await resetMails();
      if (mine.length > mailsSeen) {
        mailsSeen = mine.length;
        const match = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(
          mine[mine.length - 1].text
        );
        if (!match) throw new Error('Reset mail carried no link');
        return match[1];
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Timed out waiting for a new reset mail');
  };

  const requestLink = () =>
    request(server).post('/auth/forgot-password').send({ email });

  const openSession = async (): Promise<string> => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, role: true }
    });
    return (await tokens.issue(user)).refreshToken;
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
      displayName: 'somchai-reset'
    });
    userId = (created.body as { id: string }).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  describe('POST /auth/forgot-password (AUTH-005)', () => {
    it('accepts a registered address and mails a link', async () => {
      await requestLink().expect(202);

      await expect(readResetTokenFromInbox()).resolves.toEqual(
        expect.any(String)
      );
    });

    it('answers the same way for an address with no account', () => {
      return request(server)
        .post('/auth/forgot-password')
        .send({ email: `nobody-${email}` })
        .expect(202);
    });

    it('never puts the token in the response', async () => {
      const response = await requestLink().expect(202);
      const token = await readResetTokenFromInbox();

      expect(JSON.stringify(response.body ?? {})).not.toContain(token);
    });

    it('stores only a digest of the token', async () => {
      await requestLink();
      const token = await readResetTokenFromInbox();

      const rows = await prisma.passwordResetToken.findMany({
        where: { userId }
      });
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.tokenHash).not.toBe(token);
        expect(row.tokenHash).toHaveLength(64);
      }
    });

    it('retires the previous link when a new one is asked for', async () => {
      await requestLink();
      const first = await readResetTokenFromInbox();

      await requestLink();
      const second = await readResetTokenFromInbox();
      expect(second).not.toBe(first);

      await request(server)
        .post('/auth/reset-password')
        .send({ token: first, password: newPassword })
        .expect(401);
    });

    it('rejects a malformed address before it reaches the service', () => {
      return request(server)
        .post('/auth/forgot-password')
        .send({ email: 'not-an-email' })
        .expect(400);
    });
  });

  describe('POST /auth/reset-password (AUTH-005)', () => {
    it('rejects a token that was never issued', () => {
      return request(server)
        .post('/auth/reset-password')
        .send({
          token: 'n0t-a-real-reset-token-but-long-enough',
          password: newPassword
        })
        .expect(401);
    });

    it('rejects a weak new password', async () => {
      await requestLink();
      const token = await readResetTokenFromInbox();

      await request(server)
        .post('/auth/reset-password')
        .send({ token, password: 'nodigitshere' })
        .expect(400);
    });

    it('changes the password, kills every session, and burns the link', async () => {
      // Two live sessions from before the reset.
      const staleSession = await openSession();
      await openSession();
      expect(
        await prisma.userSession.count({ where: { userId, revokedAt: null } })
      ).toBe(2);

      await requestLink();
      const token = await readResetTokenFromInbox();

      await request(server)
        .post('/auth/reset-password')
        .send({ token, password: newPassword })
        .expect(204);

      // Every device is signed out (AUTH-005).
      expect(
        await prisma.userSession.count({ where: { userId, revokedAt: null } })
      ).toBe(0);
      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: staleSession })
        .expect(401);

      // The link is spent.
      await request(server)
        .post('/auth/reset-password')
        .send({ token, password: 'An0therPassword' })
        .expect(401);

      // The old password is gone and the new one works.
      await request(server)
        .post('/auth/login')
        .send({ email, password })
        .expect(401);
      await request(server)
        .post('/auth/login')
        .send({ email, password: newPassword })
        .expect(200);
    });
  });
});
