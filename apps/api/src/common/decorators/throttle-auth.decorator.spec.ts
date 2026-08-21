import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { ThrottleAuth, ThrottleOtp } from './throttle-auth.decorator';

/**
 * The guard is left off AppModule under test (every e2e request comes from
 * 127.0.0.1, so one shared counter would just have the suites throttling each
 * other). This builds a throwaway app instead, so the decorators and the guard
 * are exercised for real against a limit small enough to reach in a test.
 */
@Controller('probe')
class ProbeController {
  @ThrottleAuth()
  @Get('auth')
  auth() {
    return { ok: true };
  }

  @ThrottleOtp()
  @Get('otp')
  otp() {
    return { ok: true };
  }

  @Get('open')
  open() {
    return { ok: true };
  }
}

describe('Throttle decorators (section 6)', () => {
  let app: INestApplication<App>;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    // Read at request time by the decorators, so setting them here is enough.
    process.env.THROTTLE_TTL_SECONDS = '60';
    process.env.AUTH_THROTTLE_LIMIT = '2';
    process.env.OTP_THROTTLE_LIMIT = '4';

    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 50 }])],
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await app.close();
  });

  const hit = (path: string) => request(app.getHttpServer()).get(path);

  it('lets the allowed number of auth attempts through', async () => {
    await hit('/probe/auth').expect(200);
    await hit('/probe/auth').expect(200);
  });

  it('turns away the attempt after the auth limit', async () => {
    await hit('/probe/auth');
    await hit('/probe/auth');

    await hit('/probe/auth').expect(429);
  });

  it('gives the OTP step a longer leash than login', async () => {
    // Four allowed where auth allows two: honest users do mistype a code.
    for (let i = 0; i < 4; i++) await hit('/probe/otp').expect(200);

    await hit('/probe/otp').expect(429);
  });

  it('counts each endpoint separately', async () => {
    await hit('/probe/auth');
    await hit('/probe/auth');
    await hit('/probe/auth').expect(429);

    // Spending the auth budget must not lock the OTP step too.
    await hit('/probe/otp').expect(200);
  });

  it('leaves undecorated routes on the blanket limit', async () => {
    for (let i = 0; i < 6; i++) await hit('/probe/open').expect(200);
  });
});
