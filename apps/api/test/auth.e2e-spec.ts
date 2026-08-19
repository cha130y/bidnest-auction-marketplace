import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Unique per run so repeated local runs never collide on the email index.
  const email = `auth-e2e-${Date.now()}@example.com`;
  const validBody = {
    email,
    password: 'Str0ngPassw0rd',
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    displayName: 'somchai-e2e'
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = configureApp(
      moduleFixture.createNestApplication()
    ) as INestApplication<App>;
    prisma = app.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  describe('POST /auth/register (AUTH-001)', () => {
    it('creates the account and its profile', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(validBody)
        .expect(201);

      expect(response.body).toMatchObject({
        email,
        role: 'USER',
        status: 'ACTIVE',
        firstName: 'สมชาย',
        lastName: 'ใจดี',
        displayName: 'somchai-e2e'
      });
      const body = response.body as { id: string };
      expect(body.id).toEqual(expect.any(String));

      const profile = await prisma.userProfile.findUnique({
        where: { userId: body.id }
      });
      expect(profile?.displayName).toBe('somchai-e2e');
    });

    it('never leaks the password hash', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validBody, email: `dup-${email}` });

      expect(JSON.stringify(response.body)).not.toContain('$2');
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('password');

      await prisma.user.deleteMany({ where: { email: `dup-${email}` } });
    });

    it('rejects an email that is already registered', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send(validBody)
        .expect(409);
    });

    it('rejects a password with no digit', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...validBody,
          email: `weak-${email}`,
          password: 'nodigitshere'
        })
        .expect(400);
    });

    it('rejects a malformed email', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validBody, email: 'not-an-email' })
        .expect(400);
    });

    it('rejects a missing display name', () => {
      const { displayName, ...withoutDisplayName } = validBody;
      void displayName;

      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...withoutDisplayName, email: `nodisplay-${email}` })
        .expect(400);
    });

    it('strips unknown fields instead of trusting them', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validBody, email: `extra-${email}`, role: 'ADMIN' })
        .expect(400);
    });
  });
});
