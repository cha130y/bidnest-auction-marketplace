import { ValidateBy, type ValidationOptions } from 'class-validator';

/**
 * Rejects a `Date` that has already gone by, give or take `graceMs`.
 *
 * The grace is required, not defaulted: how much lateness is ordinary depends
 * on what is being scheduled and on how finely the form that collects it lets
 * a value be picked, and a number invented here would be wrong for both.
 *
 * Anything that is not a valid `Date` passes. What is wrong with it is
 * `@IsDate()`'s to say, and one field answering with two complaints only makes
 * the message harder to read.
 */
export const IsNotInThePast = (
  graceMs: number,
  validationOptions?: ValidationOptions
) =>
  ValidateBy(
    {
      name: 'isNotInThePast',
      validator: {
        validate: (value: unknown) =>
          !(value instanceof Date) ||
          Number.isNaN(value.getTime()) ||
          value.getTime() >= Date.now() - graceMs,
        defaultMessage: (args) =>
          `${args?.property ?? 'value'} must not be in the past`
      }
    },
    validationOptions
  );
