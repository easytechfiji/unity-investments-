import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  checkoutBody,
  productId,
  resetData,
  setShopSettings,
  startHarness,
  stockOf,
  type Harness,
} from './harness.js';

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await resetData(h.db);
  await setShopSettings(h.db, { fxRate: '0.440000' });
  h.sent.length = 0;
  h.paypal.behaviour.captureAmount = undefined;
  h.paypal.behaviour.decline = false;
  h.paypal.behaviour.signatureValid = true;
});

async function startPaypalOrder(quantity = 2) {
  const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
  const res = await request(h.app)
    .post('/v1/orders')
    .send(
      checkoutBody([{ productId: paper, variantId: null, quantity }], { paymentMethod: 'paypal' }),
    );
  expect(res.status).toBe(201);
  return res.body as { reference: string; paypalOrderId: string; orderNumber: string };
}

function webhook(event: object) {
  return request(h.app)
    .post('/v1/paypal/webhook')
    .set({
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://api.paypal.com/cert',
      'paypal-transmission-id': 'x',
      'paypal-transmission-sig': 'y',
      'paypal-transmission-time': new Date().toISOString(),
    })
    .send(event);
}

describe('PayPal', () => {
  it('shows the converted amount before paying and is hidden without a rate', async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    const priced = await request(h.app)
      .post('/v1/cart/price')
      .send({
        lines: [{ productId: paper, variantId: null, quantity: 2 }],
        deliveryMethod: 'click_and_collect',
      });
    expect(priced.body.paypal).toEqual({ currency: 'AUD', amount: '12.76', rate: '0.440000' });

    await setShopSettings(h.db, { fxRate: undefined });
    const site = await request(h.app).get('/v1/site');
    expect(site.body.paypalAvailable).toBe(false);
    const refused = await request(h.app)
      .post('/v1/orders')
      .send(
        checkoutBody([{ productId: paper, variantId: null, quantity: 1 }], {
          paymentMethod: 'paypal',
        }),
      );
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('paypal_unavailable');
  });

  it('creates the PayPal order on the server with the server amount, and holds no stock yet', async () => {
    const created = await startPaypalOrder();
    const fake = h.paypal.orders.get(created.paypalOrderId);
    expect(fake).toMatchObject({ amount: '12.76', currency: 'AUD', customId: created.reference });
    expect(await stockOf(h.db, 'a4-copy-paper-80gsm-500-sheets')).toBe(120);
    expect(h.sent).toHaveLength(0);
  });

  it('captures, checks the amount, marks paid once, takes stock and emails', async () => {
    const created = await startPaypalOrder();
    const capture = await request(h.app)
      .post('/v1/orders/paypal/capture')
      .send({ reference: created.reference, paypalOrderId: created.paypalOrderId });
    expect(capture.status).toBe(200);
    const [row] = await h.db.query<{
      payment_state: string;
      order_state: string;
      payment_reference: string;
      charge_amount: string;
    }>('select payment_state, order_state, payment_reference, charge_amount from public.orders');
    expect(row).toMatchObject({
      payment_state: 'paid',
      order_state: 'processing',
      payment_reference: `CAP-${created.paypalOrderId}`,
      charge_amount: '12.76',
    });
    expect(await stockOf(h.db, 'a4-copy-paper-80gsm-500-sheets')).toBe(118);
    expect(h.sent.map((email) => email.to).sort()).toEqual([
      'buyer@example.test',
      'shop@example.test',
    ]);

    // A second capture call (double click) changes nothing.
    await request(h.app)
      .post('/v1/orders/paypal/capture')
      .send({ reference: created.reference, paypalOrderId: created.paypalOrderId });
    expect(h.sent).toHaveLength(2);
    expect(await stockOf(h.db, 'a4-copy-paper-80gsm-500-sheets')).toBe(118);
  });

  it('never marks paid when the captured amount does not match', async () => {
    const created = await startPaypalOrder();
    h.paypal.behaviour.captureAmount = '0.01';
    const capture = await request(h.app)
      .post('/v1/orders/paypal/capture')
      .send({ reference: created.reference, paypalOrderId: created.paypalOrderId });
    expect(capture.status).toBe(409);
    expect(capture.body.error.code).toBe('payment_review');
    const [row] = await h.db.query<{ payment_state: string }>(
      'select payment_state from public.orders',
    );
    expect(row?.payment_state).toBe('awaiting');
  });

  it('gives the stock back when PayPal declines', async () => {
    const created = await startPaypalOrder();
    h.paypal.behaviour.decline = true;
    const capture = await request(h.app)
      .post('/v1/orders/paypal/capture')
      .send({ reference: created.reference, paypalOrderId: created.paypalOrderId });
    expect(capture.status).toBe(402);
    expect(await stockOf(h.db, 'a4-copy-paper-80gsm-500-sheets')).toBe(120);
    const [row] = await h.db.query<{ payment_state: string; stock_reserved: boolean }>(
      'select payment_state, stock_reserved from public.orders',
    );
    expect(row).toEqual({ payment_state: 'failed', stock_reserved: false });
  });

  it('takes no money when the stock sold out between ordering and paying', async () => {
    const created = await startPaypalOrder(2);
    await h.db.query(
      `update public.products set stock = 1 where slug = 'a4-copy-paper-80gsm-500-sheets'`,
    );
    const capture = await request(h.app)
      .post('/v1/orders/paypal/capture')
      .send({ reference: created.reference, paypalOrderId: created.paypalOrderId });
    expect(capture.status).toBe(409);
    expect(capture.body.error.code).toBe('sold_out');
    expect(h.paypal.orders.get(created.paypalOrderId)?.captured).toBe(false);
    expect(await stockOf(h.db, 'a4-copy-paper-80gsm-500-sheets')).toBe(1);
    const [row] = await h.db.query<{ order_state: string }>(
      'select order_state from public.orders',
    );
    expect(row?.order_state).toBe('cancelled');
  });

  it('refuses a capture for an order id that does not match', async () => {
    const created = await startPaypalOrder();
    const capture = await request(h.app)
      .post('/v1/orders/paypal/capture')
      .send({ reference: created.reference, paypalOrderId: 'FAKE9999' });
    expect(capture.status).toBe(404);
  });

  it('handles a replayed webhook once (one paid mark, one set of emails)', async () => {
    const created = await startPaypalOrder();
    const event = {
      id: 'WH-EVENT-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'CAP-WEBHOOK',
        status: 'COMPLETED',
        amount: { value: '12.76', currency_code: 'AUD' },
        supplementary_data: { related_ids: { order_id: created.paypalOrderId } },
      },
    };
    const first = await webhook(event);
    const second = await webhook(event);
    const third = await webhook(event);
    expect(first.body.result).toBe('handled');
    expect(second.body.result).toBe('duplicate');
    expect(third.body.result).toBe('duplicate');
    expect(h.sent).toHaveLength(2);
    expect(await stockOf(h.db, 'a4-copy-paper-80gsm-500-sheets')).toBe(118);
    const [row] = await h.db.query<{ payment_state: string }>(
      'select payment_state from public.orders',
    );
    expect(row?.payment_state).toBe('paid');
  });

  it('rejects a webhook whose signature PayPal does not confirm', async () => {
    const created = await startPaypalOrder();
    h.paypal.behaviour.signatureValid = false;
    const res = await webhook({
      id: 'WH-FORGED',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'X',
        amount: { value: '12.76', currency_code: 'AUD' },
        supplementary_data: { related_ids: { order_id: created.paypalOrderId } },
      },
    });
    expect(res.status).toBe(400);
    const [row] = await h.db.query<{ payment_state: string }>(
      'select payment_state from public.orders',
    );
    expect(row?.payment_state).toBe('awaiting');
  });

  it('ignores a webhook with the wrong amount', async () => {
    const created = await startPaypalOrder();
    const res = await webhook({
      id: 'WH-WRONG-AMOUNT',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'X',
        amount: { value: '1.00', currency_code: 'AUD' },
        supplementary_data: { related_ids: { order_id: created.paypalOrderId } },
      },
    });
    expect(res.status).toBe(200);
    const [row] = await h.db.query<{ payment_state: string }>(
      'select payment_state from public.orders',
    );
    expect(row?.payment_state).toBe('awaiting');
  });
});
