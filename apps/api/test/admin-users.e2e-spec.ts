import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { authRegistry } from './helpers/auth';

// ID จริงจาก apps/api/prisma/seed.ts — ต้อง seed DB ก่อนรัน (pnpm --dir apps/api exec prisma db seed)
const ADMIN_USER_ID = '00000000-0000-4000-8000-000000000001'; // ADMIN_ID
const REGULAR_USER_ID = '00000000-0000-4000-8000-000000000004'; // BUYER_ID

describe('Admin users routes (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let authOf: (userId: string) => string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();
    // Without this the suite runs without the global ValidationPipe and
    // exception filter that main.ts installs — every other e2e file calls it,
    // and its absence here is why nothing caught the unvalidated query below.
    app = configureApp(
      moduleRef.createNestApplication()
    ) as INestApplication<App>;
    await app.init();
    server = app.getHttpServer();
    authOf = await authRegistry(app, [ADMIN_USER_ID, REGULAR_USER_ID]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('non-admin โดน 403', () => {
    return request(server)
      .get('/admin/users')
      .set('Authorization', authOf(REGULAR_USER_ID))
      .expect(403);
  });

  it('admin เข้าได้', () => {
    return request(server)
      .get('/admin/users')
      .set('Authorization', authOf(ADMIN_USER_ID))
      .expect(200);
  });

  /**
   * ADM-002 — what the list refuses.
   *
   * `cursor`, `limit`, `status` and `role` were read as bare query strings,
   * which the global ValidationPipe does not check, so each reached Prisma as
   * typed: four answered 500, and an unbounded `limit` answered 200 with the
   * whole users table. Only a ListAdminUsersDto turns those into 400s, and
   * only a request through the real pipe can show that it does — a unit test
   * on the DTO would pass either way, since the bug was that it never ran.
   */
  describe('query validation', () => {
    const reject = (query: string) =>
      request(server)
        .get(`/admin/users${query}`)
        .set('Authorization', authOf(ADMIN_USER_ID))
        .expect(400);

    it('refuses a limit that is not a number', () => reject('?limit=abc'));

    // The one that used to answer 200 — with every account in the table
    it('refuses a limit past the cap', () => reject('?limit=99999'));

    it('refuses a limit below one', () => reject('?limit=0'));

    it('refuses a cursor that is not a uuid', () => reject('?cursor=notauuid'));

    it('refuses a status that is not one', () => reject('?status=BOGUS'));

    it('refuses a role that is not one', () => reject('?role=BOGUS'));

    it('refuses a parameter it does not know', () =>
      reject('?sellerId=whoever'));

    it('still accepts the ones it does know', async () => {
      const response = await request(server)
        .get('/admin/users?status=ACTIVE&role=USER&limit=2')
        .set('Authorization', authOf(ADMIN_USER_ID))
        .expect(200);

      const rows = response.body as { status: string; role: string }[];
      expect(rows.length).toBeLessThanOrEqual(2);
      for (const row of rows) {
        expect(row.status).toBe('ACTIVE');
        expect(row.role).toBe('USER');
      }
    });

    it('never returns a password hash', async () => {
      const response = await request(server)
        .get('/admin/users?limit=5')
        .set('Authorization', authOf(ADMIN_USER_ID))
        .expect(200);

      for (const row of response.body as Record<string, unknown>[]) {
        expect(row).not.toHaveProperty('passwordHash');
      }
    });
  });
});
