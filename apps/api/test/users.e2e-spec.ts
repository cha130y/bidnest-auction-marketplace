import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import { authRegistry } from './helpers/auth';

/** USR-001 — the signed-in user's own profile. */
describe('Users profile (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let server: App;
  let authOf: (userId: string) => string;

  const run = Date.now();
  let userId: string;
  let otherId: string;

  const createUser = async (kind: string) => {
    const user = await prisma.user.create({
      data: {
        email: `profile-${kind}-${run}@example.com`,
        profile: {
          create: { firstName: 'Somchai', displayName: `${kind}-${run}` }
        }
      },
      select: { id: true }
    });
    return user.id;
  };

  const patch = (body: Record<string, unknown>) =>
    request(server)
      .patch('/users/me')
      .set('Authorization', authOf(userId))
      .send(body);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = configureApp(
      moduleFixture.createNestApplication()
    ) as INestApplication<App>;
    prisma = app.get(PrismaService);
    await app.init();
    server = app.getHttpServer();

    userId = await createUser('me');
    otherId = await createUser('other');
    authOf = await authRegistry(app, [userId, otherId]);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await app.close();
  });

  describe('GET /users/me', () => {
    it('turns away a signed-out caller', () => {
      return request(server).get('/users/me').expect(401);
    });

    it('returns the caller and never a password hash', async () => {
      const response = await request(server)
        .get('/users/me')
        .set('Authorization', authOf(userId))
        .expect(200);

      const body = response.body as {
        id: string;
        email: string;
        profile: { displayName: string };
      };
      expect(body.id).toBe(userId);
      expect(body.email).toBe(`profile-me-${run}@example.com`);
      expect(body.profile.displayName).toBe(`me-${run}`);
      expect(JSON.stringify(body)).not.toContain('passwordHash');
    });

    it('gives each caller their own profile, never the other one', async () => {
      const response = await request(server)
        .get('/users/me')
        .set('Authorization', authOf(otherId))
        .expect(200);

      expect((response.body as { id: string }).id).toBe(otherId);
    });
  });

  describe('PATCH /users/me', () => {
    it('writes the fields it is given', async () => {
      const response = await patch({
        firstName: 'Somsak',
        lastName: 'ใจดี',
        displayName: `renamed-${run}`,
        bio: 'Collector of old keyboards',
        phone: '0812345678',
        recipientName: 'Somsak Jaidee',
        line1: '123 Sukhumvit Rd',
        line2: 'Floor 5',
        city: 'Bangkok',
        postalCode: '10110'
      }).expect(200);

      expect(
        (response.body as { profile: Record<string, unknown> }).profile
      ).toMatchObject({
        firstName: 'Somsak',
        lastName: 'ใจดี',
        displayName: `renamed-${run}`,
        bio: 'Collector of old keyboards',
        phone: '0812345678',
        recipientName: 'Somsak Jaidee',
        line1: '123 Sukhumvit Rd',
        line2: 'Floor 5',
        city: 'Bangkok',
        postalCode: '10110'
      });
    });

    /*
     * The widths are not arbitrary — they are checkout's, and the reason the
     * profile has them is so an address saved here can always be sent to
     * `POST /orders/checkout`. If someone widens one of these without widening
     * the other, this is the test that says so.
     */
    it('refuses a city longer than checkout would accept', () => {
      return patch({ city: 'ก'.repeat(101) }).expect(400);
    });

    it('refuses a postal code longer than checkout would accept', () => {
      return patch({ postalCode: '1'.repeat(21) }).expect(400);
    });

    it('leaves fields it was not given alone', async () => {
      await patch({ bio: 'first' }).expect(200);
      const response = await patch({ phone: '0899999999' }).expect(200);

      const profile = (response.body as { profile: { bio: string } }).profile;
      expect(profile.bio).toBe('first');
    });

    it('clears an optional field when sent null', async () => {
      await patch({ bio: 'to be cleared' }).expect(200);
      const response = await patch({ bio: null }).expect(200);

      expect(
        (response.body as { profile: { bio: string | null } }).profile.bio
      ).toBeNull();
    });

    it('treats an empty string as clearing, not as a blank value', async () => {
      const response = await patch({ city: '   ' }).expect(200);

      expect(
        (response.body as { profile: { city: string | null } }).profile.city
      ).toBeNull();
    });

    it('refuses to blank out the display name', () => {
      return patch({ displayName: '   ' }).expect(400);
    });

    it('refuses to blank out the first name', () => {
      return patch({ firstName: '' }).expect(400);
    });

    it('rejects an avatar that is not a url', () => {
      return patch({ avatarUrl: 'not a url' }).expect(400);
    });

    it('rejects a field beyond its column width', () => {
      return patch({ phone: '0'.repeat(31) }).expect(400);
    });

    it('strips unknown fields instead of trusting them', () => {
      // role would be a privilege escalation if it were honoured.
      return patch({ role: 'ADMIN' }).expect(400);
    });

    it('turns away a signed-out caller', () => {
      return request(server)
        .patch('/users/me')
        .send({ bio: 'anonymous' })
        .expect(401);
    });

    it('cannot touch anybody else, since the id comes from the token', async () => {
      await patch({ bio: 'mine only' }).expect(200);

      const other = await request(server)
        .get('/users/me')
        .set('Authorization', authOf(otherId))
        .expect(200);
      expect(
        (other.body as { profile: { bio: string | null } }).profile.bio
      ).toBeNull();
    });
  });
});
