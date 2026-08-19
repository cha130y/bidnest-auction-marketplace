import { Transform } from 'class-transformer';

/**
 * Trims a string before validation runs, so `@IsNotEmpty()` also rejects input
 * that is nothing but whitespace.
 */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
