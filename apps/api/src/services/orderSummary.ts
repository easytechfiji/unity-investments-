import { centsToDecimal, toCents, type OrderSummary } from '@od/shared';
import { rows, type Client } from '../db.js';
import { loadPrivateSettings } from './settings.js';

interface OrderRow {
  id: number;
  public_ref: string;
  order_number: string;
  created_at: Date;
  email: string;
  first_name: string;
  last_name: string | null;
  phone: string;
  street_number: string | null;
  street_name: string | null;
  city: string | null;
  state: string | null;
  country: string;
  ship_to_different_address: boolean;
  ship_first_name: string | null;
  ship_last_name: string | null;
  ship_street_number: string | null;
  ship_street_name: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_country: string | null;
  delivery_method: OrderSummary['deliveryMethod'];
  shipping_region: string | null;
  shipping_cost: string;
  subtotal: string;
  tax_total: string;
  total: string;
  currency: string;
  charge_currency: string | null;
  charge_amount: string | null;
  fx_rate: string | null;
  payment_method: OrderSummary['paymentMethod'];
  payment_state: OrderSummary['paymentState'];
  order_state: OrderSummary['orderState'];
  customer_note: string | null;
  [key: string]: unknown;
}

function formatAddress(parts: (string | null)[]): string | null {
  const text = parts.filter((part) => part && part.trim()).join(', ');
  return text || null;
}

/** Everything a customer may see about their own order. Internal ids stay out. */
export async function loadOrderSummary(
  client: Client,
  orderId: number,
): Promise<OrderSummary & { phone: string; note: string | null }> {
  const [order] = await rows<OrderRow>(client, 'select * from public.orders where id = $1', [
    orderId,
  ]);
  if (!order) throw new Error('Order not found');
  const items = await rows<{
    name: string;
    sku: string | null;
    color: string | null;
    size: string | null;
    unit_price: string;
    quantity: number;
  }>(
    client,
    'select name, sku, color, size, unit_price, quantity from public.order_items where order_id = $1 order by id',
    [orderId],
  );

  const shipToOther = order.ship_to_different_address;
  const address =
    order.delivery_method === 'shipping'
      ? shipToOther
        ? formatAddress([
            [order.ship_first_name, order.ship_last_name].filter(Boolean).join(' '),
            [order.ship_street_number, order.ship_street_name].filter(Boolean).join(' '),
            order.ship_city,
            order.ship_state,
            order.ship_country,
          ])
        : formatAddress([
            [order.street_number, order.street_name].filter(Boolean).join(' '),
            order.city,
            order.state,
            order.country,
          ])
      : null;

  const showBank =
    order.payment_method === 'bank_transfer' &&
    order.payment_state === 'awaiting' &&
    order.order_state !== 'cancelled';
  const bank = showBank ? (await loadPrivateSettings(client)).bank : null;
  // Only when the shop has entered at least the account number; otherwise the page says to contact the shop.
  const bankDetails = bank?.accountNumber ? bank : null;

  return {
    reference: order.public_ref,
    orderNumber: order.order_number,
    createdAt: order.created_at.toISOString(),
    email: order.email,
    name: [order.first_name, order.last_name].filter(Boolean).join(' '),
    phone: order.phone,
    note: order.customer_note,
    deliveryMethod: order.delivery_method,
    shippingRegion: order.shipping_region,
    address,
    paymentMethod: order.payment_method,
    paymentState: order.payment_state,
    orderState: order.order_state,
    currency: order.currency.trim(),
    subtotal: order.subtotal,
    shipping: order.shipping_cost,
    tax: order.tax_total,
    total: order.total,
    charge:
      order.charge_currency && order.charge_amount && order.fx_rate
        ? {
            currency: order.charge_currency.trim(),
            amount: order.charge_amount,
            rate: order.fx_rate,
          }
        : null,
    items: items.map((item) => ({
      name: item.name,
      sku: item.sku,
      variant: [item.color, item.size].filter(Boolean).join(', ') || null,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      lineTotal: centsToDecimal(toCents(item.unit_price) * item.quantity),
    })),
    bankDetails,
  };
}
