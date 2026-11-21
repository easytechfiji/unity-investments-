import {
  centsToDecimal,
  toCents,
  type Checkout,
  type CreatedOrder,
  type OrderSummary,
} from '@od/shared';
import type { DatabaseError } from 'pg';
import type { AppConfig } from '../config/env.js';
import { rows, type Client, type Db } from '../db.js';
import { HttpError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { MediaStore } from '../lib/media.js';
import { PaypalDeclinedError, type Paypal } from '../lib/paypal.js';
import type { Notifications, OrderEmailKind } from './notifications.js';
import { loadOrderSummary } from './orderSummary.js';
import { deliveryAndTotals, paypalCharge, priceLines } from './pricing.js';
import { loadPrivateSettings } from './settings.js';

interface Deps {
  db: Db;
  config: AppConfig;
  media: MediaStore;
  logger: Logger;
  paypal: Paypal;
  notifications: Notifications;
}

// Stock -------------------------------------------------------------------

/**
 * Takes the stock for every line of an order. Each update only succeeds if
 * enough stock is left (`stock >= qty` in the same statement), so two buyers
 * can never both get the last item. If any line fails, the caller's transaction
 * is rolled back and nothing changes.
 */
export async function reserveStock(client: Client, orderId: number): Promise<void> {
  const items = await rows<{
    name: string;
    product_id: number | null;
    variant_id: number | null;
    quantity: number;
  }>(
    client,
    'select name, product_id, variant_id, quantity from public.order_items where order_id = $1 order by id',
    [orderId],
  );
  for (const item of items) {
    const result = item.variant_id
      ? await client.query(
          'update public.product_variants set stock = stock - $1 where id = $2 and stock >= $1',
          [item.quantity, item.variant_id],
        )
      : await client.query(
          'update public.products set stock = stock - $1 where id = $2 and stock >= $1',
          [item.quantity, item.product_id],
        );
    if (result.rowCount === 0) {
      throw new HttpError(
        409,
        'sold_out',
        `Sorry, there is not enough stock left of ${item.name}.`,
      );
    }
  }
  await client.query('update public.orders set stock_reserved = true where id = $1', [orderId]);
}

/** Gives an order's stock back. The guard on stock_reserved makes it happen at most once. */
export async function releaseStock(client: Client, orderId: number): Promise<void> {
  const released = await client.query(
    'update public.orders set stock_reserved = false where id = $1 and stock_reserved returning id',
    [orderId],
  );
  if (released.rowCount === 0) return;
  const items = await rows<{
    product_id: number | null;
    variant_id: number | null;
    quantity: number;
  }>(
    client,
    'select product_id, variant_id, quantity from public.order_items where order_id = $1',
    [orderId],
  );
  for (const item of items) {
    if (item.variant_id) {
      await client.query('update public.product_variants set stock = stock + $1 where id = $2', [
        item.quantity,
        item.variant_id,
      ]);
    } else if (item.product_id) {
      await client.query('update public.products set stock = stock + $1 where id = $2', [
        item.quantity,
        item.product_id,
      ]);
    }
  }
}

// Orders ------------------------------------------------------------------

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const pgError = error as Partial<DatabaseError>;
  return pgError.code === '23505' && pgError.constraint === constraint;
}

export function createOrders(deps: Deps) {
  const { db, config, media, logger, paypal, notifications } = deps;

  async function sendEmails(kind: OrderEmailKind, orderId: number): Promise<void> {
    try {
      const { order, settings } = await db.tx(async (client) => ({
        order: await loadOrderSummary(client, orderId),
        settings: await loadPrivateSettings(client),
      }));
      await notifications.orderEmails(kind, order, settings);
    } catch (error) {
      logger.error('could not send order emails', {
        kind,
        orderId,
        errorName: (error as Error).name,
      });
    }
  }

  async function existingOrder(checkoutToken: string): Promise<CreatedOrder | null> {
    const [row] = await db.query<{
      public_ref: string;
      order_number: string;
      total: string;
      payment_method: CreatedOrder['paymentMethod'];
      paypal_order_id: string | null;
    }>(
      'select public_ref, order_number, total, payment_method, paypal_order_id from public.orders where checkout_token = $1',
      [checkoutToken],
    );
    return row
      ? {
          reference: row.public_ref,
          orderNumber: row.order_number,
          total: row.total,
          paymentMethod: row.payment_method,
          paypalOrderId: row.paypal_order_id,
        }
      : null;
  }

  async function createOrder(input: Checkout): Promise<CreatedOrder> {
    const repeat = await existingOrder(input.checkoutToken);
    if (repeat) return repeat;

    const settings = await loadPrivateSettings(db);
    const isPaypal = input.paymentMethod === 'paypal';

    let created: {
      id: number;
      reference: string;
      orderNumber: string;
      total: string;
      chargeAmount: string | null;
      chargeCurrency: string | null;
    };
    try {
      created = await db.tx(async (client) => {
        // Bank transfer orders take stock now, so lock the rows while we price them.
        const cart = await priceLines(client, media, input.lines, { lock: !isPaypal });
        if (!cart.ok) {
          throw new HttpError(
            409,
            'cart_changed',
            'Some items in your cart are no longer available as chosen. Please check your cart.',
            cart.lines
              .map((line, index) =>
                line.problem ? { path: `lines.${index}`, message: line.problem } : null,
              )
              .filter((field) => field !== null),
          );
        }
        const totals = await deliveryAndTotals(client, config, cart.subtotalCents, input);
        const total = centsToDecimal(totals.totalCents);
        if (input.expectedTotal && input.expectedTotal !== total) {
          throw new HttpError(
            409,
            'price_changed',
            'Prices or delivery costs have changed. Please check the new total.',
          );
        }
        const charge = isPaypal
          ? paypalCharge(config, settings.paypalFxRate, totals.totalCents)
          : null;
        if (isPaypal && !charge) {
          throw new HttpError(
            400,
            'paypal_unavailable',
            'PayPal is not available right now. Please choose bank transfer.',
          );
        }

        const address = input.deliveryMethod === 'shipping' ? input.address : undefined;
        const recipient =
          input.deliveryMethod === 'shipping' && input.shipToDifferentAddress
            ? input.recipient
            : undefined;
        const [order] = await rows<{ id: number; public_ref: string; order_number: string }>(
          client,
          `insert into public.orders (
             checkout_token, email, first_name, last_name, phone,
             street_number, street_name, city, state, country,
             ship_to_different_address, ship_first_name, ship_last_name, ship_phone,
             ship_street_number, ship_street_name, ship_city, ship_state, ship_country,
             delivery_method, shipping_region, shipping_cost, subtotal, tax_total, total, currency,
             charge_currency, charge_amount, fx_rate, payment_method, customer_note
           ) values (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, 'Fiji', $10, $11, $12, $13, $14, $15, $16, $17, $18,
             $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
           ) returning id, public_ref, order_number`,
          [
            input.checkoutToken,
            input.email,
            input.firstName,
            input.lastName ?? null,
            input.phone,
            address?.streetNumber ?? null,
            address?.streetName ?? null,
            address?.city ?? null,
            address?.division ?? null,
            Boolean(recipient),
            recipient?.firstName ?? null,
            recipient?.lastName ?? null,
            recipient?.phone ?? null,
            recipient?.address.streetNumber ?? null,
            recipient?.address.streetName ?? null,
            recipient?.address.city ?? null,
            recipient?.address.division ?? null,
            recipient ? 'Fiji' : null,
            input.deliveryMethod,
            totals.regionName,
            centsToDecimal(totals.shippingCents ?? 0),
            centsToDecimal(cart.subtotalCents),
            centsToDecimal(totals.taxCents),
            total,
            config.SHOP_CURRENCY,
            charge?.currency ?? null,
            charge ? centsToDecimal(charge.cents) : null,
            charge?.rate ?? null,
            input.paymentMethod,
            input.note || null,
          ],
        );
        if (!order) throw new Error('Order insert returned no row');

        for (const line of cart.lines) {
          const [colour, size] = await variantNames(client, line.variantId);
          await client.query(
            `insert into public.order_items (order_id, product_id, variant_id, name, sku, color, size, unit_price, quantity)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              order.id,
              line.productId,
              line.variantId,
              line.name,
              line.sku,
              colour,
              size,
              centsToDecimal(line.unitCents),
              line.quantity,
            ],
          );
        }
        if (!isPaypal) await reserveStock(client, order.id);

        return {
          id: order.id,
          reference: order.public_ref,
          orderNumber: order.order_number,
          total,
          chargeAmount: charge ? centsToDecimal(charge.cents) : null,
          chargeCurrency: charge?.currency ?? null,
        };
      });
    } catch (error) {
      // Two identical submissions at the same moment: the second one loses the
      // race on the unique checkout token, so return the first one's order.
      if (isUniqueViolation(error, 'orders_checkout_token_key')) {
        const winner = await existingOrder(input.checkoutToken);
        if (winner) return winner;
      }
      throw error;
    }

    if (!isPaypal) {
      await sendEmails('placed', created.id);
      return {
        reference: created.reference,
        orderNumber: created.orderNumber,
        total: created.total,
        paymentMethod: 'bank_transfer',
        paypalOrderId: null,
      };
    }

    try {
      const paypalOrderId = await paypal.createOrder({
        reference: created.reference,
        orderNumber: created.orderNumber,
        currency: created.chargeCurrency ?? '',
        amount: created.chargeAmount ?? '',
        brandName: settings.siteName,
      });
      await db.query('update public.orders set paypal_order_id = $1 where id = $2', [
        paypalOrderId,
        created.id,
      ]);
      return {
        reference: created.reference,
        orderNumber: created.orderNumber,
        total: created.total,
        paymentMethod: 'paypal',
        paypalOrderId,
      };
    } catch (error) {
      logger.error('paypal create order failed', {
        orderNumber: created.orderNumber,
        errorName: (error as Error).name,
      });
      await db.query(
        `update public.orders set payment_state = 'failed', order_state = 'cancelled' where id = $1`,
        [created.id],
      );
      throw new HttpError(
        502,
        'paypal_error',
        'PayPal could not start the payment. Please try again or choose bank transfer.',
      );
    }
  }

  async function variantNames(
    client: Client,
    variantId: number | null,
  ): Promise<[string | null, string | null]> {
    if (variantId === null) return [null, null];
    const [row] = await rows<{ colour: string | null; size: string | null }>(
      client,
      `select colour.name as colour, size.name as size from public.product_variants v
       left join public.attribute_values colour on colour.id = v.color_id
       left join public.attribute_values size on size.id = v.size_id
       where v.id = $1`,
      [variantId],
    );
    return [row?.colour ?? null, row?.size ?? null];
  }

  /**
   * Marks a PayPal order paid, once. Returns true only for the call that made the
   * change, so emails are sent exactly once however many times this runs.
   */
  async function markPaid(client: Client, orderId: number, captureId: string): Promise<boolean> {
    const result = await client.query(
      `update public.orders
       set payment_state = 'paid', payment_reference = $2, paid_at = now(),
           order_state = case when order_state = 'pending' then 'processing'::public.order_state else order_state end
       where id = $1 and payment_state <> 'paid'
       returning id`,
      [orderId, captureId],
    );
    return result.rowCount === 1;
  }

  interface PaypalOrderRow {
    id: number;
    paypal_order_id: string | null;
    payment_state: string;
    order_state: string;
    charge_amount: string | null;
    charge_currency: string | null;
    public_ref: string;
    order_number: string;
    stock_reserved: boolean;
    [key: string]: unknown;
  }

  function captureMatches(
    order: PaypalOrderRow,
    amount: string | null,
    currency: string | null,
  ): boolean {
    if (!amount || !currency || !order.charge_amount || !order.charge_currency) return false;
    try {
      return (
        toCents(amount) === toCents(order.charge_amount) &&
        currency === order.charge_currency.trim()
      );
    } catch {
      return false;
    }
  }

  async function capturePaypal(
    reference: string,
    paypalOrderId: string,
  ): Promise<{ orderNumber: string; paid: boolean }> {
    const [order] = await db.query<PaypalOrderRow>(
      `select * from public.orders where public_ref = $1 and payment_method = 'paypal' and deleted_at is null`,
      [reference],
    );
    if (!order || order.paypal_order_id !== paypalOrderId)
      throw new HttpError(404, 'not_found', 'Order not found.');
    if (order.payment_state === 'paid') return { orderNumber: order.order_number, paid: true };
    if (order.order_state === 'cancelled')
      throw new HttpError(409, 'order_cancelled', 'This order was cancelled.');

    // Take the stock before taking the money. If it has sold out, nothing is charged.
    try {
      await db.tx(async (client) => {
        const [locked] = await rows<{ stock_reserved: boolean }>(
          client,
          'select stock_reserved from public.orders where id = $1 for update',
          [order.id],
        );
        if (locked && !locked.stock_reserved) await reserveStock(client, order.id);
      });
    } catch (error) {
      if (error instanceof HttpError && error.code === 'sold_out') {
        await db.query(
          `update public.orders set order_state = 'cancelled', payment_state = 'failed' where id = $1`,
          [order.id],
        );
      }
      throw error;
    }

    let capture;
    try {
      capture = await paypal.captureOrder(paypalOrderId);
    } catch (error) {
      if (error instanceof PaypalDeclinedError) {
        await db.tx(async (client) => {
          await releaseStock(client, order.id);
          await client.query(`update public.orders set payment_state = 'failed' where id = $1`, [
            order.id,
          ]);
        });
        throw new HttpError(
          402,
          'payment_declined',
          'PayPal declined the payment. Please try another way to pay.',
        );
      }
      // Unknown result (for example a timeout). Keep the stock held; the webhook
      // will confirm the payment, or the shop can cancel the order.
      logger.error('paypal capture failed', {
        orderNumber: order.order_number,
        errorName: (error as Error).name,
      });
      throw new HttpError(
        502,
        'paypal_error',
        'We could not confirm the payment with PayPal yet. Please check your email before trying again.',
      );
    }

    if (
      capture.status !== 'COMPLETED' ||
      !capture.captureId ||
      !captureMatches(order, capture.amount, capture.currency)
    ) {
      // Money may have moved but not as expected. Never mark it paid; leave it for a person to check.
      logger.error('paypal capture did not match the order', {
        orderNumber: order.order_number,
        status: capture.status,
        currency: capture.currency,
      });
      throw new HttpError(
        409,
        'payment_review',
        'Your payment needs to be checked by the shop. We will contact you.',
      );
    }

    const changed = await db.tx((client) => markPaid(client, order.id, capture.captureId ?? ''));
    if (changed) await sendEmails('paid', order.id);
    return { orderNumber: order.order_number, paid: true };
  }

  interface WebhookEvent {
    id?: string;
    event_type?: string;
    resource?: {
      id?: string;
      status?: string;
      custom_id?: string;
      amount?: { value?: string; currency_code?: string };
      supplementary_data?: { related_ids?: { order_id?: string } };
    };
  }

  /** Handles a PayPal webhook whose signature has already been verified. */
  async function handleWebhook(event: WebhookEvent): Promise<'handled' | 'duplicate' | 'ignored'> {
    if (!event.id || !event.event_type) return 'ignored';
    const paypalOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
    const [order] = paypalOrderId
      ? await db.query<PaypalOrderRow>('select * from public.orders where paypal_order_id = $1', [
          paypalOrderId,
        ])
      : [];

    const firstTime = await db.query(
      'insert into public.payment_events (event_id, event_type, order_id) values ($1, $2, $3) on conflict (event_id) do nothing returning event_id',
      [event.id, event.event_type, order?.id ?? null],
    );
    if (firstTime.length === 0) return 'duplicate';
    if (!order) return 'ignored';

    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        if (
          !captureMatches(
            order,
            event.resource?.amount?.value ?? null,
            event.resource?.amount?.currency_code ?? null,
          )
        ) {
          logger.error('paypal webhook amount did not match the order', {
            orderNumber: order.order_number,
          });
          return 'handled';
        }
        let changed: boolean;
        try {
          changed = await db.tx(async (client) => {
            const [locked] = await rows<{ stock_reserved: boolean }>(
              client,
              'select stock_reserved from public.orders where id = $1 for update',
              [order.id],
            );
            if (locked && !locked.stock_reserved) await reserveStock(client, order.id);
            return markPaid(client, order.id, event.resource?.id ?? '');
          });
        } catch (error) {
          if (error instanceof HttpError && error.code === 'sold_out') {
            // Paid but the stock is gone. Mark paid without stock so the shop sees it and arranges a refund.
            logger.error('paid order could not take stock', { orderNumber: order.order_number });
            changed = await db.tx((client) => markPaid(client, order.id, event.resource?.id ?? ''));
          } else {
            throw error;
          }
        }
        if (changed) await sendEmails('paid', order.id);
        return 'handled';
      }
      case 'PAYMENT.CAPTURE.DENIED':
        await db.tx(async (client) => {
          await releaseStock(client, order.id);
          await client.query(
            `update public.orders set payment_state = 'failed' where id = $1 and payment_state <> 'paid'`,
            [order.id],
          );
        });
        return 'handled';
      case 'PAYMENT.CAPTURE.REFUNDED':
        await db.query(`update public.orders set payment_state = 'refunded' where id = $1`, [
          order.id,
        ]);
        return 'handled';
      default:
        return 'ignored';
    }
  }

  async function lookup(reference: string, email: string): Promise<OrderSummary> {
    const [order] = await db.query<{ id: number }>(
      'select id from public.orders where public_ref = $1 and lower(email) = lower($2) and deleted_at is null',
      [reference, email],
    );
    // The same answer for a wrong reference and a wrong email, so neither can be probed.
    if (!order)
      throw new HttpError(404, 'not_found', 'No order matches that reference and email address.');
    return db.tx((client) => loadOrderSummary(client, order.id));
  }

  return {
    createOrder,
    capturePaypal,
    handleWebhook,
    lookup,
    sendEmails,
    reserveStock,
    releaseStock,
  };
}

export type Orders = ReturnType<typeof createOrders>;
