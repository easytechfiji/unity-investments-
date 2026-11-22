import type { z } from 'zod';
import { ValidationError } from './errors.js';

/**
 * Checks untrusted input (a body, query or route parameters) against a zod
 * schema and returns typed data, or throws a clean 400 error.
 *
 * Use z.strictObject for request schemas so unknown fields, such as a `price`
 * the browser should never send, are rejected instead of silently ignored.
 */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError(result.error);
  return result.data;
}
