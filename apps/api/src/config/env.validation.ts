import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

export type EnvVariable = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>): EnvVariable {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    throw new Error(
      `Invalid environment variables\n${z.prettifyError(result.error)}`,
    );
  }

  return result.data;
}
