import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
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
    app = moduleRef.createNestApplication();
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
});
