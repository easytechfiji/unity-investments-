import type { ApiErrorBody } from '@od/shared';
import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { HttpError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';

export function sendError(res: Response, error: HttpError): void {
  const body: ApiErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      requestId: res.locals.requestId,
      ...(error.fields ? { fields: error.fields } : {}),
    },
  };
  res.status(error.status).json(body);
}

export const notFound: RequestHandler = (_req, res) => {
  sendError(res, new HttpError(404, 'not_found', 'Not found.'));
};

// Errors raised by express.json() carry a `type` and a `status`.
function bodyParserError(err: unknown): HttpError | null {
  if (typeof err !== 'object' || err === null || !('type' in err)) return null;
  switch (err.type) {
    case 'entity.parse.failed':
      return new HttpError(400, 'invalid_json', 'The request body is not valid JSON.');
    case 'entity.too.large':
      return new HttpError(413, 'payload_too_large', 'The request body is too large.');
    case 'encoding.unsupported':
    case 'charset.unsupported':
      return new HttpError(415, 'unsupported_encoding', 'Unsupported request encoding.');
    default:
      return null;
  }
}

// Database rule violations become plain messages. The database's own text is
// never shown, because it can quote the values that broke the rule.
function databaseError(err: unknown): HttpError | null {
  if (typeof err !== 'object' || err === null || !('code' in err) || !('severity' in err))
    return null;
  const constraint =
    'constraint' in err && typeof err.constraint === 'string' ? err.constraint : '';
  switch (err.code) {
    case '23505':
      return new HttpError(
        409,
        'duplicate',
        constraint.includes('slug')
          ? 'That web address (slug) is already used.'
          : 'A record with that value already exists.',
      );
    case '23503':
      return new HttpError(
        409,
        'in_use',
        'This is linked to other records, so it cannot be changed or removed.',
      );
    case '23514':
    case '23502':
      return new HttpError(400, 'invalid_value', 'One of the values is not allowed.');
    default:
      return null;
  }
}

/**
 * The one place errors turn into responses. Expected errors (HttpError) are
 * shown as they are. Anything else becomes a generic 500 so stack traces and
 * database messages never reach the visitor.
 *
 * Unexpected errors are logged without their message in production, because
 * database messages can quote the data that failed, for example an email in
 * a duplicate key error.
 */
export function errorHandler(logger: Logger, production: boolean): ErrorRequestHandler {
  return (err: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const known = err instanceof HttpError ? err : (bodyParserError(err) ?? databaseError(err));
    if (known) {
      sendError(res, known);
      return;
    }

    const error = err instanceof Error ? err : new Error('Non-error value thrown');
    const code =
      typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
    logger.error('unhandled error', {
      requestId: res.locals.requestId,
      errorName: error.name,
      errorCode: code,
      ...(production
        ? { stack: error.stack?.split('\n').slice(1).join('\n') }
        : { errorMessage: error.message, stack: error.stack }),
    });

    sendError(res, new HttpError(500, 'internal_error', 'Something went wrong on our side.'));
  };
}
