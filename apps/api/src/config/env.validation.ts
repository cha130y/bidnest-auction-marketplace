import { Logger } from '@nestjs/common';
import z from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().max(65535).min(0),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  // Public origin of apps/web — used to build the password reset link (AUTH-005)
  WEB_APP_URL: z.url().default('http://localhost:3000'),

  // AUTH-002 / AUTH-004. Two separate secrets so a leaked access token
  // can never be replayed as a refresh token.
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_TTL: z.string().default('7d'),

  // AUTH-007 — email OTP, mandatory on every login path
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),

  // AUTH-005 — single-use password reset link
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  // AUTH-003 / AUTH-006. Only the public identifiers: the server verifies
  // tokens rather than exchanging them, so the client secrets stay in
  // apps/web with NextAuth. Optional so the API still boots without them —
  // the callbacks answer 503 instead of failing at startup.
  GOOGLE_CLIENT_ID: z.string().optional(),
  LINE_CHANNEL_ID: z.string().optional(),

  // Section 6 — rate limits. The generous default is a blanket guard against
  // hammering; the auth window is the one that matters, since login and OTP
  // are the endpoints worth brute forcing.
  THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
  AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(5),
  OTP_THROTTLE_LIMIT: z.coerce.number().int().positive().default(10),

  // Maildev in development, real SMTP relay in production (SRS section 3)
  MAIL_HOST: z.string().default('localhost'),
  MAIL_PORT: z.coerce.number().int().max(65535).min(0).default(1025),
  MAIL_FROM: z.string().default('BidNest <no-reply@bidnest.local>'),

  // AI-001 (Customer Service Chatbot) — Dev 5. Optional for the same reason
  // GOOGLE_CLIENT_ID/CLOUDINARY_* are: the API has to boot without it, so a
  // teammate without a Gemini key isn't blocked from running the app at all —
  // /support/chat just answers 503 (GeminiClientService.isConfigured).
  GEMINI_API_KEY: z.string().min(1).optional(),
  // AI-003 (Negotiator accept token) — Dev 5, Optional
  AI_NEGOTIATOR_JWT_SECRET: z
    .string()
    .min(1)
    .default('dev-negotiator-secret-change-me'),

  /**
   * AUC-001 — where uploaded auction images are kept.
   *
   * Optional for the reason GOOGLE_CLIENT_ID is: the API has to boot without
   * them. Most of the team never touches image upload, and making these
   * required would mean somebody working on the design system has to open a
   * Cloudinary account before they can start the server.
   *
   * The upload route answers 503 when they are missing, decided before the
   * request goes anywhere — see StorageService.isConfigured.
   */
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional()
});

export function validate(config: Record<string, any>) {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const logger = new Logger('EnvValidation');
    logger.error('Env validation failed', z.prettifyError(parsed.error));
    throw new Error('Env validation failed');
  }
  return parsed.data;
}

export type EnvVariable = z.infer<typeof envSchema>;
