import { Throttle } from '@nestjs/throttler';

/**
 * Section 6 — "จำกัดความถี่ (rate-limit) การ login, การตรวจสอบ/ขอส่ง OTP ใหม่".
 *
 * The global throttler is a blanket cap; these two tighten the handful of
 * endpoints actually worth brute forcing. Limits are read at request time
 * rather than baked in at decoration time, so a deployment can tune them
 * through the environment without a rebuild.
 *
 * Decorators run before the DI container exists, which is why this reads
 * process.env rather than ConfigService. The values were already validated at
 * boot by config/env.validation.ts, so a bad one cannot reach here.
 */
const envLimit = (name: string, fallback: number) => () => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const ttl = () => {
  const seconds = Number(process.env.THROTTLE_TTL_SECONDS);
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000;
};

/**
 * For endpoints where each attempt is a guess at a secret: login, register,
 * password reset. Deliberately tight.
 */
export const ThrottleAuth = () =>
  Throttle({
    default: { limit: envLimit('AUTH_THROTTLE_LIMIT', 5), ttl }
  });

/**
 * For the OTP step, which honest users do fat-finger. Looser than the login
 * window, still far below what guessing a six-digit code would need.
 */
export const ThrottleOtp = () =>
  Throttle({
    default: { limit: envLimit('OTP_THROTTLE_LIMIT', 10), ttl }
  });
