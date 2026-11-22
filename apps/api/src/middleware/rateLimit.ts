import { rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { HttpError } from '../lib/errors.js';
import { sendError } from './errorHandler.js';

interface LimitOptions {
  windowMinutes: number;
  limit: number;
  /** RATE_LIMIT_SCALE from the config. Tests raise it; production keeps 1. */
  scale?: number;
}

/**
 * Per-IP request limits. Counts live in memory, which is fine for a single API
 * process. If the API ever runs as several processes, move the store to Redis
 * or rely on Cloudflare rate limiting rules.
 */
export function createRateLimit({ windowMinutes, limit, scale = 1 }: LimitOptions): RequestHandler {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: limit * scale,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      sendError(
        res,
        new HttpError(429, 'rate_limited', 'Too many requests. Please wait and try again.'),
      );
    },
  });
}

// Catalogue browsing and general API use.
export const relaxedLimit = (scale = 1) => createRateLimit({ windowMinutes: 1, limit: 300, scale });

// Contact, quote, order lookup and checkout. Applied per route group in later phases.
export const strictLimit = (scale = 1) => createRateLimit({ windowMinutes: 10, limit: 10, scale });
