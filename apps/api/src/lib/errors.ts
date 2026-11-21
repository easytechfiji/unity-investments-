import type { z } from 'zod';

/**
 * An error we expect and are happy to show the client, such as "not found".
 * The message must be safe for anyone to read.
 */
export class HttpError extends Error {
  override name = 'HttpError';

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export class ValidationError extends HttpError {
  override name = 'ValidationError';

  constructor(error: z.ZodError) {
    super(
      400,
      'invalid_input',
      'Some of the information sent was not valid.',
      error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
}
