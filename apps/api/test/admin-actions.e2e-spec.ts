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
const TARGET_USER_ID = '00000000-0000-4000-8000-000000000002'; // SELLER_A_ID — เป้าหมายที่จะ suspend ทดสอบ

describe('Admin actions routes (e2e)', () => {
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

  /**
   * Put seller-a back before closing.
   *
   * The suspend test below is the only write this suite makes, and it never
   * undid it — so every run left a seeded account SUSPENDED in whatever
   * database it ran against. On the shared dev database that is not a stale
   * fixture but a real actor: `seller-a@bidnest.test` owns seeded listings,
   * and a suspended seller cannot log in, list, or sell, so the next person
   * to demo with that account finds it locked for no visible reason.
   *
   * The audit row the test asserts on is untouched — `admin_actions` is
   * append-only, and reactivating simply adds a second row after it.
   */
  afterAll(async () => {
    await request(server)
      .patch(`/admin/users/${TARGET_USER_ID}/reactivate`)
      .set('Authorization', authOf(ADMIN_USER_ID))
      .send({ note: 'e2e teardown' });

    await app.close();
  });

  it('non-admin โดน 403', () => {
    return request(server)
      .get('/admin/actions')
      .set('Authorization', authOf(REGULAR_USER_ID))
      .expect(403);
  });

  it('suspend user แล้วต้องเห็น audit log ใหม่', async () => {
    await request(server)
      .patch(`/admin/users/${TARGET_USER_ID}/suspend`)
      .set('Authorization', authOf(ADMIN_USER_ID))
      .expect(200);

    const response = await request(server)
      .get('/admin/actions?actionType=SUSPEND_USER')
      .set('Authorization', authOf(ADMIN_USER_ID))
      .expect(200);

    const body = response.body as unknown[];
    expect(body.length).toBeGreaterThan(0);
  });

  /**
   * ADM-004 — what the log refuses.
   *
   * Same three bare query strings as ADM-002 and ADM-005 had, with the same
   * result: unchecked into Prisma, three of them 500, and an unbounded
   * `limit` returning the whole table — which on an append-only audit log
   * only gets worse the longer the project runs.
   */
  describe('query validation', () => {
    const reject = (query: string) =>
      request(server)
        .get(`/admin/actions${query}`)
        .set('Authorization', authOf(ADMIN_USER_ID))
        .expect(400);

    it('refuses a limit that is not a number', () => reject('?limit=abc'));

    // The one that used to answer 200 — with the whole audit log
    it('refuses a limit past the cap', () => reject('?limit=99999'));

    it('refuses a limit below one', () => reject('?limit=0'));

    it('refuses a cursor that is not a uuid', () => reject('?cursor=notauuid'));

    it('refuses an actionType that is not one', () =>
      reject('?actionType=BOGUS'));

    it('refuses a parameter it does not know', () => reject('?adminId=who'));

    it('still accepts the ones it does know', async () => {
      const response = await request(server)
        .get('/admin/actions?actionType=SUSPEND_USER&limit=2')
        .set('Authorization', authOf(ADMIN_USER_ID))
        .expect(200);

      const rows = response.body as { actionType: string }[];
      expect(rows.length).toBeLessThanOrEqual(2);
      for (const row of rows) expect(row.actionType).toBe('SUSPEND_USER');
    });
  });
});
