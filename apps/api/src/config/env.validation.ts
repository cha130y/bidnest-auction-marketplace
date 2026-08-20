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

  // Maildev in development, real SMTP relay in production (SRS section 3)
  MAIL_HOST: z.string().default('localhost'),
  MAIL_PORT: z.coerce.number().int().max(65535).min(0).default(1025),
  MAIL_FROM: z.string().default('BidNest <no-reply@bidnest.local>'),

  // AI-001 (Customer Service Chatbot) — Dev 5
  GEMINI_API_KEY: z.string().min(1),
  // AI-003 (Negotiator accept token) — Dev 5, Optional
  AI_NEGOTIATOR_JWT_SECRET: z
    .string()
    .min(1)
    .default('dev-negotiator-secret-change-me')
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
