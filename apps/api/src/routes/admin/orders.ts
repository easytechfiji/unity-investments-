import { adminOrderStateSchema, idSchema, ORDER_STATES } from '@od/shared';
import { Router } from 'express';
import { z } from 'zod';
import { rows } from '../../db.js';
import { HttpError } from '../../lib/errors.js';
import { renderInvoice } from '../../lib/invoice.js';
import { parseInput } from '../../lib/validate.js';
import { audit } from '../../middleware/adminAuth.js';
import type { Services } from '../../services/container.js';
import { loadOrderSummary } from '../../services/orderSummary.js';
import { loadPrivateSettings } from '../../services/settings.js';
import { requireDeleteConfirmation } from './resources.js';

type OrderState = (typeof ORDER_STATES)[number];

// The only status changes allowed. Completed and cancelled orders are final.
export const TRANSITIONS: Record<OrderState, OrderState[]> = {
  pending: ['processing', 'cancelled'],
  processing: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const listQuerySchema = z.strictObject({
  state: z.enum(ORDER_STATES).optional(),
  payment: z.enum(['awaiting', 'paid', 'failed', 'refunded']).optional(),
  q: z.string().trim().max(100).optional(),
  trash: z.enum(['1']).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

const PAGE_SIZE = 50;

export function orderRoutes(services: Services): Router {
  const { db, orders } = services;
  const router = Router();

  router.get('/orders', async (req, res) => {
    const query = parseInput(listQuerySchema, req.query);
    const where = [query.trash ? 'deleted_at is not null' : 'deleted_at is null'];
    const params: unknown[] = [];
    if (query.state) {
      params.push(query.state);
      where.push(`order_state = $${params.length}`);
    }
    if (query.payment) {
      params.push(query.payment);
      where.push(`payment_state = $${params.length}`);
    }
    if (query.q) {
      params.push(`%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
      const p = `$${params.length}`;
      where.push(
        `(order_number ilike ${p} or email ilike ${p} or first_name ilike ${p} or last_name ilike ${p})`,
      );
    }
    params.push(PAGE_SIZE, (query.page - 1) * PAGE_SIZE);
    const found = await db.query<{ total_count: number }>(
      `select id, order_number, created_at, first_name, last_name, email, total, currency, payment_method,
              payment_state, order_state, delivery_method, shipping_region, deleted_at, count(*) over () as total_count
       from public.orders where ${where.join(' and ')}
       order by created_at desc, id desc
       limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    res.set('Cache-Control', 'no-store').json({
      orders: found,
      total: found[0]?.total_count ?? 0,
      page: query.page,
      pageSize: PAGE_SIZE,
    });
  });

  router.get('/orders/:id', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const detail = await db.tx(async (client) => {
      const [extra] = await rows<Record<string, unknown>>(
        client,
        `select id, phone, customer_note, payment_reference, paypal_order_id, paid_at, stock_reserved,
                updated_at, deleted_at, street_number, street_name, city, state, ship_first_name, ship_last_name, ship_phone
         from public.orders where id = $1`,
        [id],
      );
      if (!extra) return null;
      return {
        ...(await loadOrderSummary(client, id)),
        ...extra,
        bankDetails: undefined,
        allowedStates: [] as OrderState[],
      };
    });
    if (!detail) throw new HttpError(404, 'not_found', 'Not found.');
    detail.allowedStates = TRANSITIONS[detail.orderState];
    res.set('Cache-Control', 'no-store').json(detail);
  });

  router.post('/orders/:id/state', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const { state } = parseInput(adminOrderStateSchema, req.body);
    await db.tx(async (client) => {
      const [order] = await rows<{ order_state: OrderState; deleted_at: Date | null }>(
        client,
        'select order_state, deleted_at from public.orders where id = $1 for update',
        [id],
      );
      if (!order || order.deleted_at) throw new HttpError(404, 'not_found', 'Not found.');
      if (!TRANSITIONS[order.order_state].includes(state)) {
        throw new HttpError(
          409,
          'bad_transition',
          `An order that is ${order.order_state} cannot be changed to ${state}.`,
        );
      }
      if (state === 'cancelled') await orders.releaseStock(client, id);
      await client.query('update public.orders set order_state = $2 where id = $1', [id, state]);
    });
    await audit(db, req, res, `state_${state}`, 'orders', id);
    if (state !== 'pending') await orders.sendEmails(state, id);
    res.json({ ok: true });
  });

  router.post('/orders/:id/mark-paid', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    await db.tx(async (client) => {
      const [order] = await rows<{
        payment_method: string;
        payment_state: string;
        order_state: OrderState;
        stock_reserved: boolean;
      }>(
        client,
        'select payment_method, payment_state, order_state, stock_reserved from public.orders where id = $1 and deleted_at is null for update',
        [id],
      );
      if (!order) throw new HttpError(404, 'not_found', 'Not found.');
      if (order.payment_method !== 'bank_transfer')
        throw new HttpError(
          409,
          'not_bank_transfer',
          'Only bank transfer orders are marked paid by hand.',
        );
      if (order.payment_state === 'paid')
        throw new HttpError(409, 'already_paid', 'This order is already marked paid.');
      if (order.order_state === 'cancelled')
        throw new HttpError(409, 'order_cancelled', 'This order was cancelled.');
      if (!order.stock_reserved) await orders.reserveStock(client, id);
      await client.query(
        `update public.orders set payment_state = 'paid', paid_at = now(),
           order_state = case when order_state = 'pending' then 'processing'::public.order_state else order_state end
         where id = $1`,
        [id],
      );
    });
    await audit(db, req, res, 'mark_paid', 'orders', id);
    await orders.sendEmails('paid', id);
    res.json({ ok: true });
  });

  router.get('/orders/:id/invoice.pdf', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const { summary, settings } = await db.tx(async (client) => {
      const [exists] = await rows(client, 'select 1 from public.orders where id = $1', [id]);
      if (!exists) throw new HttpError(404, 'not_found', 'Not found.');
      return {
        summary: await loadOrderSummary(client, id),
        settings: await loadPrivateSettings(client),
      };
    });
    const pdf = await renderInvoice(summary, {
      siteName: settings.siteName,
      address: settings.address,
      phone: settings.phone,
      email: settings.shopEmail,
    });
    res
      .set('Content-Type', 'application/pdf')
      .set('Content-Disposition', `attachment; filename="invoice-${summary.orderNumber}.pdf"`)
      .set('Cache-Control', 'no-store')
      .send(pdf);
  });

  router.delete('/orders/:id', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    requireDeleteConfirmation(req);
    const result = await db.query(
      'update public.orders set deleted_at = now() where id = $1 and deleted_at is null returning id',
      [id],
    );
    if (!result.length) throw new HttpError(404, 'not_found', 'Not found.');
    await audit(db, req, res, 'trash', 'orders', id);
    res.json({ ok: true });
  });

  router.post('/orders/:id/restore', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const result = await db.query(
      'update public.orders set deleted_at = null where id = $1 returning id',
      [id],
    );
    if (!result.length) throw new HttpError(404, 'not_found', 'Not found.');
    await audit(db, req, res, 'restore', 'orders', id);
    res.json({ ok: true });
  });

  return router;
}
