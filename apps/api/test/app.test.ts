import { cartLineSchema } from '@od/shared';
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/lib/errors.js';
import { parseInput } from '../src/lib/validate.js';
import { createRateLimit } from '../src/middleware/rateLimit.js';
import { STOREFRONT_ORIGIN, testApp } from './helpers.js';

// Routes that exist only in these tests, to exercise validation and errors.
function probeRoutes(): Router {
  const router = Router();
  router.post('/probe/cart-line', (req, res) => {
    const line = parseInput(cartLineSchema, req.body);
    res.json({ line });
  });
  router.get('/probe/crash', () => {
    throw new Error('relation "orders" does not exist, key (email)=(someone@example.com)');
  });
  router.get('/probe/async-crash', async () => {
    await Promise.resolve();
    throw new Error('async failure');
  });
  router.get('/probe/teapot', () => {
    throw new HttpError(418, 'teapot', 'Short and stout.');
  });
  return router;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('health check', () => {
  it('answers 200 with a request id and security headers', async () => {
    const res = await request(testApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-request-id']).toMatch(UUID);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-robots-tag']).toBe('noindex');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('ignores a request id sent by the client', async () => {
    const res = await request(testApp()).get('/health').set('X-Request-Id', 'client-chosen-id');
    expect(res.headers['x-request-id']).toMatch(UUID);
  });
});

describe('input validation', () => {
  const app = testApp([probeRoutes()]);

  it('accepts valid input', async () => {
    const res = await request(app)
      .post('/v1/probe/cart-line')
      .send({ productId: 3, variantId: null, quantity: 2 });
    expect(res.status).toBe(200);
  });

  it('rejects a price field with a clean 400 listing the problem', async () => {
    const res = await request(app)
      .post('/v1/probe/cart-line')
      .send({ productId: 3, variantId: null, quantity: 2, price: 0.01 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_input');
    expect(res.body.error.requestId).toMatch(UUID);
    expect(res.body.error.fields).toEqual([
      expect.objectContaining({ message: expect.stringContaining('price') }),
    ]);
  });

  it('rejects a negative quantity', async () => {
    const res = await request(app)
      .post('/v1/probe/cart-line')
      .send({ productId: 3, variantId: null, quantity: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error.fields[0].path).toBe('quantity');
  });

  it('rejects a blank body instead of crashing', async () => {
    const res = await request(app).post('/v1/probe/cart-line');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_input');
  });

  it('rejects malformed JSON', async () => {
    const res = await request(app)
      .post('/v1/probe/cart-line')
      .set('Content-Type', 'application/json')
      .send('{"productId": 3,');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_json');
  });

  it('rejects a body over the size limit', async () => {
    const res = await request(app)
      .post('/v1/probe/cart-line')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ padding: 'x'.repeat(30_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('payload_too_large');
  });
});

describe('error handling', () => {
  const app = testApp([probeRoutes()]);

  it('hides the details of unexpected errors', async () => {
    const res = await request(app).get('/v1/probe/crash');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('internal_error');
    expect(JSON.stringify(res.body)).not.toContain('orders');
    expect(JSON.stringify(res.body)).not.toContain('someone@example.com');
    expect(res.text).not.toContain('at ');
  });

  it('catches errors thrown in async handlers', async () => {
    const res = await request(app).get('/v1/probe/async-crash');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('internal_error');
  });

  it('passes expected errors through with their status', async () => {
    const res = await request(app).get('/v1/probe/teapot');
    expect(res.status).toBe(418);
    expect(res.body.error).toMatchObject({ code: 'teapot', message: 'Short and stout.' });
  });

  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/optimize');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('CORS', () => {
  const app = testApp();

  it('allows the storefront origin', async () => {
    const res = await request(app).get('/health').set('Origin', STOREFRONT_ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(STOREFRONT_ORIGIN);
  });

  it('gives no CORS permission to other origins', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('rate limiting', () => {
  it('returns 429 with the standard error shape once the limit is passed', async () => {
    const router = Router();
    router.get('/limited', createRateLimit({ windowMinutes: 1, limit: 2 }), (_req, res) => {
      res.json({ ok: true });
    });
    const app = testApp([router]);

    expect((await request(app).get('/v1/limited')).status).toBe(200);
    expect((await request(app).get('/v1/limited')).status).toBe(200);
    const res = await request(app).get('/v1/limited');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('rate_limited');
  });
});
