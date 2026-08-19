import { Logger } from '@nestjs/common';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535),
  DATABASE_URL: z.url(),
  GEMINI_API_KEY: z.string().min(1),
  AI_NEGOTIATOR_JWT_SECRET: z
    .string()
    .min(1)
    .default('dev-negotiator-secret-change-me'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
});

export type EnvVariable = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvVariable {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const logger = new Logger('EnvValidation');
    logger.error(
      'Environment validation failed:',
      z.prettifyError(parsed.error),
    );
    throw new Error('Environment validation failed');
  }

  return parsed.data;
}
