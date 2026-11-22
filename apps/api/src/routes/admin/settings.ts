import { adminSettingsSchema } from '@od/shared';
import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../lib/errors.js';
import { parseInput } from '../../lib/validate.js';
import { audit, requireOwner } from '../../middleware/adminAuth.js';
import type { Services } from '../../services/container.js';

export function settingsRoutes(services: Services): Router {
  const { db, config } = services;
  const router = Router();

  router.get('/settings', requireOwner(), async (_req, res) => {
    const [settings] = await db.query<Record<string, unknown>>(
      'select * from public.site_settings where id = 1',
    );
    const [sale] = await db.query<{ active: boolean; ends_at: Date | null }>(
      'select active, ends_at from public.sale_settings where id = 1',
    );
    if (!settings)
      throw new HttpError(
        500,
        'missing_settings',
        'The settings row is missing. Run the database migrations.',
      );
    res.set('Cache-Control', 'no-store').json({
      ...settings,
      sale_active: sale?.active ?? false,
      sale_ends_at: sale?.ends_at ? sale.ends_at.toISOString() : null,
      paypal_currency: config.PAYPAL_CURRENCY ?? null,
      paypal_configured: Boolean(config.PAYPAL_CLIENT_ID),
    });
  });

  router.put('/settings', requireOwner(), async (req, res) => {
    const { sale_active, sale_ends_at, ...site } = parseInput(adminSettingsSchema, req.body);
    if (sale_active && (!sale_ends_at || new Date(sale_ends_at) <= new Date())) {
      throw new HttpError(400, 'invalid_input', 'A sale needs an end date in the future.', [
        { path: 'sale_ends_at', message: 'Choose a future end date' },
      ]);
    }
    await db.tx(async (client) => {
      const columns = Object.keys(site);
      await client.query(
        `update public.site_settings set ${columns.map((column, i) => `${column} = $${i + 1}`).join(', ')} where id = 1`,
        Object.values(site),
      );
      await client.query('update public.sale_settings set active = $1, ends_at = $2 where id = 1', [
        sale_active,
        sale_ends_at ?? null,
      ]);
    });
    await audit(db, req, res, 'update', 'site_settings', 1);
    res.json({ ok: true });
  });

  router.get('/attribute-options', async (_req, res) => {
    res.json(await db.query('select id, code, name from public.attribute_options order by id'));
  });

  router.get('/dashboard', async (_req, res) => {
    const [counts] = await db.query<Record<string, number>>(
      `select
         count(*) filter (where order_state = 'pending') as pending,
         count(*) filter (where order_state = 'processing') as processing,
         count(*) filter (where payment_method = 'bank_transfer' and payment_state = 'awaiting' and order_state <> 'cancelled') as awaiting_bank_transfer,
         count(*) filter (where created_at > now() - interval '30 days') as orders_30_days
       from public.orders where deleted_at is null`,
    );
    const [revenue] = await db.query<{ paid_30_days: string }>(
      `select coalesce(sum(total), 0)::text as paid_30_days from public.orders
       where deleted_at is null and payment_state = 'paid' and paid_at > now() - interval '30 days'`,
    );
    const lowStock = await db.query(
      `select id, name, sku, stock from (
         select p.id, p.name, p.sku,
                case when p.type = 'variable' then coalesce((select sum(v.stock) from public.product_variants v where v.product_id = p.id), 0) else p.stock end as stock
         from public.products p where p.deleted_at is null and p.status
       ) s where stock <= 5 order by stock, name limit 15`,
    );
    const recent = await db.query(
      `select id, order_number, created_at, first_name, last_name, total, payment_method, payment_state, order_state
       from public.orders where deleted_at is null order by created_at desc limit 10`,
    );
    const [catalogue] = await db.query<{ products: number; samples: number }>(
      `select count(*) as products, count(*) filter (where sku like 'SAMPLE-%') as samples from public.products where deleted_at is null`,
    );
    // Things the owner still has to fill in, shown at the top of the dashboard.
    const [setup] = await db.query<{ bank: boolean; email: boolean; phone: boolean }>(
      `select bank_account_number is not null as bank, email is not null as email, phone is not null as phone
       from public.site_settings where id = 1`,
    );
    const missing = [
      setup?.bank
        ? null
        : 'Bank details are not set, so customers paying by bank transfer are told to contact you for them.',
      setup?.email
        ? null
        : 'The shop email is not set, so order notifications and website enquiries cannot be sent.',
      setup?.phone ? null : 'The shop phone number is not set.',
    ].filter((item) => item !== null);
    res.set('Cache-Control', 'no-store').json({
      counts,
      revenue: revenue?.paid_30_days ?? '0',
      lowStock,
      recent,
      catalogue,
      missing,
    });
  });

  const auditQuery = z.strictObject({ page: z.coerce.number().int().min(1).max(10000).default(1) });

  router.get('/audit', async (req, res) => {
    const { page } = parseInput(auditQuery, req.query);
    const entries = await db.query(
      `select l.id, l.action, l.entity, l.entity_id, l.ip::text as ip, l.created_at, coalesce(p.name, 'Removed admin') as admin_name
       from public.admin_audit_log l left join public.admin_profiles p on p.user_id = l.admin_id
       order by l.created_at desc, l.id desc limit 100 offset $1`,
      [(page - 1) * 100],
    );
    res.set('Cache-Control', 'no-store').json({ entries, page });
  });

  router.get('/admins', requireOwner(), async (_req, res) => {
    res.set('Cache-Control', 'no-store').json(
      await db.query(
        `select p.user_id, p.name, p.role, p.created_at, u.email from public.admin_profiles p
         left join auth.users u on u.id = p.user_id order by p.created_at`,
      ),
    );
  });

  return router;
}
