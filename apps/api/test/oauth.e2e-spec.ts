import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import {
  GOOGLE_VERIFIER,
  LINE_VERIFIER,
  type OAuthProfile
} from './../src/auth/oauth/oauth-profile';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * AUTH-003 / AUTH-006 end to end. The two verifiers are replaced with fakes:
 * the point of these cases is what the API does with a *verified* profile, and
 * the verifiers themselves are the only part that would need Google and Line
 * to be reachable.
 */
describe('OAuth sign-in (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let server: App;

  const run = Date.now();
  const googleEmail = `oauth-google-${run}@example.com`;
  const lineEmail = `oauth-line-${run}@example.com`;
  const localEmail = `oauth-local-${run}@example.com`;
  /** A password account that Google will later vouch for the address of. */
  const localVerifiedEmail = `oauth-local-verified-${run}@example.com`;

  let googleProfile: OAuthProfile;
  let lineProfile: OAuthProfile;
  /** Minted by the Google verify case, spent by the one after it. */
  let googleDeviceToken: string;

  const readOtp = async (email: string): Promise<string> => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const response = await fetch('http://localhost:1080/api/email');
      const messages = (await response.json()) as {
        subject: string;
        text: string;
        to: { address: string }[];
      }[];
      const mine = messages
        .filter((m) => m.to.some((t) => t.address === email))
        .filter((m) => m.subject.includes('รหัสยืนยัน'));

      if (mine.length > 0) {
        const match = /\b(\d{6})\b/.exec(mine[mine.length - 1].text);
        if (match) return match[1];
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`No OTP arrived for ${email}`);
  };

  beforeAll(async () => {
    googleProfile = {
      provider: 'GOOGLE',
      providerAccountId: `google-${run}`,
      email: googleEmail,
      emailVerified: true,
      displayName: 'Somchai G'
    };
    lineProfile = {
      provider: 'LINE',
      providerAccountId: `line-${run}`,
      emailVerified: false,
      displayName: 'Somchai L'
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(GOOGLE_VERIFIER)
      .useValue({
        provider: 'GOOGLE',
        verify: () => Promise.resolve(googleProfile)
      })
      .overrideProvider(LINE_VERIFIER)
      .useValue({
        provider: 'LINE',
        verify: () => Promise.resolve(lineProfile)
      })
      .compile();

    app = configureApp(
      moduleFixture.createNestApplication()
    ) as INestApplication<App>;
    prisma = app.get(PrismaService);
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: { in: [googleEmail, lineEmail, localEmail, localVerifiedEmail] }
      }
    });
    await app.close();
  });

  describe('POST /auth/google/callback (AUTH-003)', () => {
    it('opens an account and asks for the code, issuing no token', async () => {
      const response = await request(server)
        .post('/auth/google/callback')
        .send({ idToken: 'a-google-id-token-long-enough' })
        .expect(200);

      expect(response.body).toMatchObject({ status: 'PENDING_2FA' });
      expect(response.body).not.toHaveProperty('accessToken');

      const user = await prisma.user.findUnique({
        where: { email: googleEmail },
        select: { passwordHash: true, authAccounts: true }
      });
      // Signs in through the provider, so there is no password to guess.
      expect(user?.passwordHash).toBeNull();
      expect(user?.authAccounts[0].providerAccountId).toBe(`google-${run}`);
    });

    it('finishes on the emailed code, exactly like a local login', async () => {
      const otp = await readOtp(googleEmail);

      const response = await request(server)
        .post('/auth/google/verify')
        // Remembering the browser rides along here rather than in a test of
        // its own: the resend cooldown means only one fresh code exists per
        // run, and a second verify would be reading a spent one.
        .send({
          idToken: 'a-google-id-token-long-enough',
          otp,
          rememberDevice: true,
          deviceLabel: 'Chrome on Windows'
        })
        .expect(200);

      const body = response.body as {
        accessToken: string;
        refreshToken: string;
        deviceToken?: string;
      };
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.refreshToken).toEqual(expect.any(String));
      expect(body.deviceToken).toEqual(expect.stringMatching(/^[0-9a-f]{64}$/));

      googleDeviceToken = body.deviceToken!;
    });

    it('skips the code entirely on a browser it remembers', async () => {
      // AUTH-007 — the provider proved who this is; the code is the second
      // factor, and a browser that has answered one stands in for it. The
      // callback answers with the pair rather than PENDING_2FA, which is what
      // lets the screens skip the code screen.
      const response = await request(server)
        .post('/auth/google/callback')
        .send({
          idToken: 'a-google-id-token-long-enough',
          deviceToken: googleDeviceToken
        })
        .expect(200);

      const body = response.body as { accessToken?: string; status?: string };
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.status).toBeUndefined();
    });

    it('still asks for the code when the device is not known', async () => {
      const response = await request(server)
        .post('/auth/google/callback')
        .send({
          idToken: 'a-google-id-token-long-enough',
          deviceToken: 'f'.repeat(64)
        })
        .expect(200);

      expect(response.body).toMatchObject({ status: 'PENDING_2FA' });
    });

    it('refuses a wrong code', async () => {
      await request(server)
        .post('/auth/google/callback')
        .send({ idToken: 'a-google-id-token-long-enough' });

      await request(server)
        .post('/auth/google/verify')
        .send({ idToken: 'a-google-id-token-long-enough', otp: '000000' })
        .expect(401);
    });

    it('returns to the same account the second time round', async () => {
      await request(server)
        .post('/auth/google/callback')
        .send({ idToken: 'a-google-id-token-long-enough' })
        .expect(200);

      const users = await prisma.user.findMany({
        where: { email: googleEmail }
      });
      expect(users).toHaveLength(1);
    });
  });

  describe('POST /auth/line/callback (AUTH-006)', () => {
    it('asks for an address when Line released none', async () => {
      const response = await request(server)
        .post('/auth/line/callback')
        .send({ idToken: 'a-line-id-token-long-enough' })
        .expect(200);

      expect(response.body).toMatchObject({ status: 'EMAIL_REQUIRED' });
      expect(await prisma.user.count({ where: { email: lineEmail } })).toBe(0);
    });

    it('opens the account once an address comes with the token', async () => {
      const response = await request(server)
        .post('/auth/line/callback')
        .send({ idToken: 'a-line-id-token-long-enough', email: lineEmail })
        .expect(200);

      expect(response.body).toMatchObject({ status: 'PENDING_2FA' });

      const user = await prisma.user.findUnique({
        where: { email: lineEmail },
        select: { emailVerifiedAt: true, authAccounts: true }
      });
      // Typed by the caller, so nobody has proved they own it.
      expect(user?.emailVerifiedAt).toBeNull();
      expect(user?.authAccounts[0].provider).toBe('LINE');
    });

    it('recognises the Line id afterwards without asking again', async () => {
      const response = await request(server)
        .post('/auth/line/callback')
        .send({ idToken: 'a-line-id-token-long-enough' })
        .expect(200);

      expect(response.body).toMatchObject({ status: 'PENDING_2FA' });
    });

    it('finishes on the emailed code', async () => {
      const otp = await readOtp(lineEmail);

      const response = await request(server)
        .post('/auth/line/verify')
        .send({ idToken: 'a-line-id-token-long-enough', otp })
        .expect(200);

      expect((response.body as { accessToken: string }).accessToken).toEqual(
        expect.any(String)
      );
    });

    it('now counts the address as verified — the code proved it', async () => {
      // Line vouches for no address, so the one on this account was typed by
      // whoever was signing up. Reading a code sent there is the only evidence
      // it was really theirs, and it has now happened.
      const user = await prisma.user.findUnique({
        where: { email: lineEmail },
        select: { emailVerifiedAt: true }
      });

      expect(user?.emailVerifiedAt).toBeInstanceOf(Date);
    });
  });

  describe('linking rules', () => {
    it('refuses a Google address that already signs in with a password', async () => {
      // AUTH-003 / AUTH-006 — one address, one way in. This is the case that
      // used to link silently and sign the caller straight in: Google really
      // has verified the address, so it was safe, but it handed a password
      // account a second way in that its owner never set up.
      await request(server)
        .post('/auth/register')
        .send({
          email: localVerifiedEmail,
          password: 'Str0ngPassw0rd',
          firstName: 'Somchai',
          displayName: `localv-${run}`
        })
        .expect(201);

      // A Google id nobody has linked, carrying the address Google vouches
      // for — so resolution falls through to the email, which is the path
      // that must now refuse.
      googleProfile = {
        ...googleProfile,
        providerAccountId: `google-unlinked-${run}`,
        email: localVerifiedEmail,
        emailVerified: true
      };

      const response = await request(server)
        .post('/auth/google/callback')
        .send({ idToken: 'another-google-id-token-long-enough' })
        .expect(409);

      expect((response.body as { message: string }).message).toMatch(
        /registered with a password/i
      );
    });

    it('refuses to link on an address the provider never verified', async () => {
      await request(server)
        .post('/auth/register')
        .send({
          email: localEmail,
          password: 'Str0ngPassw0rd',
          firstName: 'Somchai',
          displayName: `local-${run}`
        })
        .expect(201);

      // A Line id nobody has linked yet, so resolution has to fall through to
      // the email — which is exactly the path that must be refused.
      lineProfile = {
        ...lineProfile,
        providerAccountId: `line-unlinked-${run}`
      };

      // A Line profile carrying no verified address must not take over an
      // account just because the caller typed its email (AUTH-006).
      await request(server)
        .post('/auth/line/callback')
        .send({
          idToken: 'another-line-id-token-long-enough',
          email: localEmail
        })
        .expect(409);
    });
  });

  describe('validation', () => {
    it('rejects a token that is too short to be real', () => {
      return request(server)
        .post('/auth/google/callback')
        .send({ idToken: 'short' })
        .expect(400);
    });

    it('rejects a malformed code', () => {
      return request(server)
        .post('/auth/google/verify')
        .send({ idToken: 'a-google-id-token-long-enough', otp: '12ab' })
        .expect(400);
    });
  });
});
