import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from '../lib/logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express types are extended through this global namespace
  namespace Express {
    interface Locals {
      requestId: string;
    }
  }
}

/**
 * Gives every request a fresh random id and logs one line when it finishes.
 * We always generate the id ourselves rather than trusting one sent by the
 * client, so nobody can write arbitrary text into our logs through a header.
 * Only the path is logged, never the query string or body, because those can
 * hold personal data.
 */
export function requestContext(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const requestId = randomUUID();
    const started = process.hrtime.bigint();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1_000_000;
      logger.info('request', {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Math.round(ms),
      });
    });

    next();
  };
}
