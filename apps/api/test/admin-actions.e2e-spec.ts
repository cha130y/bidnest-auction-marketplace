import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { authRegistry } from './helpers/auth';

// ID จริงจาก apps/api/prisma/seed.ts — ต้อง seed DB ก่อนรัน (pnpm --dir apps/api exec prisma db seed)
const ADMIN_USER_ID = '00000000-0000-4000-8000-000000000001'; // ADMIN_ID
const REGULAR_USER_ID = '00000000-0000-4000-8000-000000000004'; // BUYER_ID
const TARGET_USER_ID = '00000000-0000-4000-8000-000000000002'; // SELLER_A_ID — เป้าหมายที่จะ suspend ทดสอบ

describe('Admin actions routes (e2e)', () => {
  let app: INestApplication;
  let authOf: (userId: string) => string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    authOf = await authRegistry(app, [ADMIN_USER_ID, REGULAR_USER_ID]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('non-admin โดน 403', () => {
    return request(app.getHttpServer())
      .get('/admin/actions')
      .set('Authorization', authOf(REGULAR_USER_ID))
      .expect(403);
  });

  it('suspend user แล้วต้องเห็น audit log ใหม่', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/users/${TARGET_USER_ID}/suspend`)
      .set('Authorization', authOf(ADMIN_USER_ID))
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/admin/actions?actionType=SUSPEND_USER')
      .set('Authorization', authOf(ADMIN_USER_ID))
      .expect(200);

    expect(response.body.length).toBeGreaterThan(0);
  });
});
