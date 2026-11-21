import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { loadSampleData, loadTestFixtures } from '../../../../scripts/db/lib.mjs';
import { startFakeAuth, totpCode, type FakeAuth } from '../../dev/fakeAuth.js';
import { createApp } from '../../src/app.js';
import { loadConfig, type AppConfig } from '../../src/config/env.js';
import { createDb, type Db } from '../../src/db.js';
import type { Email } from '../../src/lib/email.js';
import { createLogger } from '../../src/lib/logger.js';
import { createServices } from '../../src/services/container.js';
import { startFakePaypal, type FakePaypal } from '../fakes/paypal.js';
import { testDatabaseUrl } from './globalSetup.js';

export const ADMIN_ORIGIN = 'http://admin.test';
export const SHOP_ORIGIN = 'http://shop.test';

export interface Harness {
  app: Express;
  db: Db;
  config: AppConfig;
  sent: Email[];
  paypal: FakePaypal;
  auth: FakeAuth;
  close(): Promise<void>;
}

/**
 * Empties every table (the audit log too, which is only possible with triggers
 * switched off for this test session) and loads the sample catalogue.
 */
export async function resetData(db: Db): Promise<void> {
  await db.query(`
    set session_replication_role = replica;
    truncate public.payment_events, public.order_items, public.orders, public.product_images,
      public.product_variants, public.products, public.subcategories, public.categories,
      public.attribute_values, public.shipping_regions, public.faqs, public.pages, public.banners,
      public.testimonials, public.redirects, public.admin_audit_log, public.admin_profiles, auth.users
      restart identity cascade;
    set session_replication_role = origin;
    update public.site_settings set phone = null, email = null, address = null, bank_account_name = null,
      bank_name = null, bank_branch_code = null, bank_account_number = null, paypal_fx_rate = null where id = 1;
    update public.sale_settings set active = false, ends_at = null where id = 1;
    alter sequence public.order_number_seq restart with 100001;
  `);
  await loadSampleData(testDatabaseUrl());
  await loadTestFixtures(testDatabaseUrl());
}

export async function startHarness(env: Record<string, string> = {}): Promise<Harness> {
  const db = createDb(testDatabaseUrl(), 4);
  await resetData(db);
  const paypal = await startFakePaypal();
  const auth = await startFakeAuth({ serviceKey: 'test-service-key' });
  const mediaDir = mkdtempSync(join(tmpdir(), 'od-media-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    CORS_ORIGINS: SHOP_ORIGIN,
    ADMIN_ORIGIN,
    DATABASE_URL: testDatabaseUrl(),
    EMAIL_PROVIDER: 'memory',
    MEDIA_DIR: mediaDir,
    AUTH_URL: auth.url,
    PAYPAL_CLIENT_ID: 'fake-client-id',
    PAYPAL_CLIENT_SECRET: 'fake-client-secret',
    PAYPAL_WEBHOOK_ID: 'fake-webhook',
    PAYPAL_CURRENCY: 'AUD',
    PAYPAL_API_BASE: paypal.url,
    RATE_LIMIT_SCALE: '50',
    ...env,
  });
  const logger = createLogger('silent');
  const services = createServices({ config, db, logger });
  const app = createApp({ config, logger, services });
  return {
    app,
    db,
    config,
    sent: services.mailer.sent ?? [],
    paypal,
    auth,
    async close() {
      await paypal.close();
      await auth.close();
      await db.close();
      rmSync(mediaDir, { recursive: true, force: true });
    },
  };
}

// Data helpers ----------------------------------------------------------------

export async function productId(db: Db, slug: string): Promise<number> {
  const [row] = await db.query<{ id: number }>('select id from public.products where slug = $1', [
    slug,
  ]);
  if (!row) throw new Error(`No product ${slug}`);
  return row.id;
}

export async function variantId(db: Db, sku: string): Promise<number> {
  const [row] = await db.query<{ id: number }>(
    'select id from public.product_variants where sku = $1',
    [sku],
  );
  if (!row) throw new Error(`No variant ${sku}`);
  return row.id;
}

export async function regionId(db: Db, name: string): Promise<number> {
  const [row] = await db.query<{ id: number }>(
    'select id from public.shipping_regions where region_name = $1',
    [name],
  );
  if (!row) throw new Error(`No region ${name}`);
  return row.id;
}

export async function stockOf(db: Db, slug: string): Promise<number> {
  const [row] = await db.query<{ stock: number }>(
    'select stock from public.products where slug = $1',
    [slug],
  );
  return row?.stock ?? -1;
}

export async function setShopSettings(
  db: Db,
  values: { email?: string; fxRate?: string; bank?: boolean } = {},
): Promise<void> {
  await db.query(
    `update public.site_settings set email = $1, paypal_fx_rate = $2,
       bank_account_name = $3, bank_name = $4, bank_branch_code = $5, bank_account_number = $6 where id = 1`,
    [
      values.email ?? 'shop@example.test',
      values.fxRate ?? null,
      values.bank === false ? null : 'TEST SHOP LTD',
      values.bank === false ? null : 'Test Bank',
      values.bank === false ? null : '012-345',
      values.bank === false ? null : '987654321',
    ],
  );
}

export function checkoutBody(
  lines: { productId: number; variantId: number | null; quantity: number }[],
  overrides: Record<string, unknown> = {},
) {
  return {
    checkoutToken: randomUUID(),
    email: 'buyer@example.test',
    firstName: 'Mere',
    lastName: 'Buyer',
    phone: '+679 123 4567',
    deliveryMethod: 'click_and_collect',
    paymentMethod: 'bank_transfer',
    lines,
    ...overrides,
  };
}

// Admin sessions ----------------------------------------------------------------

export interface AdminClient {
  get(path: string): request.Test;
  post(path: string, body?: object): request.Test;
  put(path: string, body: object): request.Test;
  delete(path: string, confirmed?: boolean): request.Test;
  upload(path: string, field: string, file: Buffer, filename: string): request.Test;
}

/**
 * Creates an admin with a verified authenticator and signs in fully
 * (password then code), keeping the HttpOnly cookies in a supertest agent.
 */
export async function signInAdmin(
  harness: Harness,
  role: 'owner' | 'staff' = 'owner',
  email = `${role}@example.test`,
): Promise<AdminClient> {
  const user = harness.auth.createUser(email, 'correct horse battery staple');
  const secret = harness.auth.addVerifiedFactor(email);
  await harness.db.query(
    'insert into auth.users (id, email) values ($1, $2) on conflict do nothing',
    [user.id, email],
  );
  await harness.db.query(
    'insert into public.admin_profiles (user_id, name, role) values ($1, $2, $3) on conflict (user_id) do update set role = excluded.role',
    [user.id, `Test ${role}`, role],
  );
  const agent = request.agent(harness.app);
  const login = await agent
    .post('/v1/admin/auth/login')
    .set('Origin', ADMIN_ORIGIN)
    .send({ email, password: 'correct horse battery staple' });
  if (login.status !== 200)
    throw new Error(`login failed ${login.status} ${JSON.stringify(login.body)}`);
  const verify = await agent
    .post('/v1/admin/auth/mfa/verify')
    .set('Origin', ADMIN_ORIGIN)
    .send({ code: totpCode(secret) });
  if (verify.status !== 200)
    throw new Error(`verify failed ${verify.status} ${JSON.stringify(verify.body)}`);
  return {
    get: (path) => agent.get(`/v1/admin${path}`).set('Origin', ADMIN_ORIGIN),
    post: (path, body = {}) =>
      agent.post(`/v1/admin${path}`).set('Origin', ADMIN_ORIGIN).send(body),
    put: (path, body) => agent.put(`/v1/admin${path}`).set('Origin', ADMIN_ORIGIN).send(body),
    delete: (path, confirmed = true) => {
      const req = agent.delete(`/v1/admin${path}`).set('Origin', ADMIN_ORIGIN);
      return confirmed ? req.set('X-Confirm-Delete', 'yes') : req;
    },
    upload: (path, field, file, filename) =>
      agent.post(`/v1/admin${path}`).set('Origin', ADMIN_ORIGIN).attach(field, file, filename),
  };
}
