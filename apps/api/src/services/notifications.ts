import { formatPrice, toCents, type OrderSummary } from '@od/shared';
import type { AppConfig } from '../config/env.js';
import { escapeHtml, type Mailer } from '../lib/email.js';
import { renderInvoice } from '../lib/invoice.js';
import type { Logger } from '../lib/logger.js';
import type { PrivateSettings } from './settings.js';

// Order emails go to the customer and to the shop inbox from the admin
// settings. Nobody else: no hidden cc or bcc, unlike the old site.

export type OrderEmailKind = 'placed' | 'paid' | 'processing' | 'completed' | 'cancelled';

const SUBJECTS: Record<OrderEmailKind, (n: string) => string> = {
  placed: (n) => `Order ${n} received`,
  paid: (n) => `Payment received for order ${n}`,
  processing: (n) => `Order ${n} is being prepared`,
  completed: (n) => `Order ${n} is complete`,
  cancelled: (n) => `Order ${n} has been cancelled`,
};

function intro(kind: OrderEmailKind, order: OrderSummary): string {
  switch (kind) {
    case 'placed':
      return order.paymentMethod === 'bank_transfer'
        ? `Thank you for your order. Please pay by bank transfer using your order number ${order.orderNumber} as the payment reference. We start preparing your order once the payment reaches our account.`
        : 'Thank you for your order. We will email you again once the payment is confirmed.';
    case 'paid':
      return 'We have received your payment and are preparing your order.';
    case 'processing':
      return 'Your order is being prepared.';
    case 'completed':
      return order.deliveryMethod === 'shipping'
        ? 'Your order has been sent out for delivery.'
        : 'Your order is ready to collect from the shop.';
    case 'cancelled':
      return 'Your order has been cancelled. If you have already paid, we will contact you about a refund.';
  }
}

export function orderEmailText(
  kind: OrderEmailKind,
  order: OrderSummary,
  settings: PrivateSettings,
  lookupUrl: string,
): string {
  const money = (value: string) => formatPrice(toCents(value), order.currency);
  const lines = [
    `Hello ${order.name},`,
    '',
    intro(kind, order),
    '',
    `Order number: ${order.orderNumber}`,
    `Order reference: ${order.reference}`,
    '',
    ...order.items.map(
      (item) =>
        `${item.quantity} x ${item.name}${item.variant ? ` (${item.variant})` : ''}  ${money(item.lineTotal)}`,
    ),
    '',
    `Subtotal: ${money(order.subtotal)}`,
    `Delivery: ${money(order.shipping)}${order.shippingRegion ? ` (${order.shippingRegion})` : ' (Click And Collect)'}`,
    ...(toCents(order.tax) > 0 ? [`Tax: ${money(order.tax)}`] : []),
    `Total: ${money(order.total)}`,
    ...(order.charge ? [`Charged by PayPal: ${order.charge.currency} ${order.charge.amount}`] : []),
  ];
  if (kind === 'placed' && order.paymentMethod === 'bank_transfer' && !order.bankDetails) {
    lines.push(
      '',
      `To pay, contact us for our bank details${settings.phone ? ` on ${settings.phone}` : ''}. Use ${order.orderNumber} as the payment reference.`,
    );
  }
  if (kind === 'placed' && order.bankDetails) {
    const bank = order.bankDetails;
    lines.push(
      '',
      'Bank transfer details',
      `Account name: ${bank.accountName ?? ''}`,
      `Bank: ${bank.bankName ?? ''}`,
      `Branch code: ${bank.branchCode ?? ''}`,
      `Account number: ${bank.accountNumber ?? ''}`,
      `Payment reference: ${order.orderNumber}`,
    );
  }
  lines.push('', `Check your order at any time: ${lookupUrl}`, '', settings.siteName);
  if (settings.phone) lines.push(settings.phone);
  if (settings.address) lines.push(settings.address);
  return lines.join('\n');
}

/** The same text as simple HTML. Every value is escaped. */
function textToHtml(text: string): string {
  const body = text
    .split('\n\n')
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;max-width:600px">${body}</div>`;
}

export function createNotifications(deps: { config: AppConfig; mailer: Mailer; logger: Logger }) {
  const { config, mailer, logger } = deps;

  async function orderEmails(
    kind: OrderEmailKind,
    order: OrderSummary,
    settings: PrivateSettings,
  ): Promise<void> {
    const lookupUrl = `${config.SITE_URL}/order-lookup?reference=${order.reference}`;
    const text = orderEmailText(kind, order, settings, lookupUrl);
    const attachInvoice = kind === 'placed' || kind === 'paid';
    const invoice = attachInvoice
      ? [
          {
            filename: `invoice-${order.orderNumber}.pdf`,
            content: await renderInvoice(order, settings.business),
          },
        ]
      : undefined;

    const sends: Promise<void>[] = [
      mailer.send({
        to: order.email,
        subject: SUBJECTS[kind](order.orderNumber),
        text,
        html: textToHtml(text),
        replyTo: settings.shopEmail ?? undefined,
        attachments: invoice,
      }),
    ];
    if (settings.shopEmail && (kind === 'placed' || kind === 'paid' || kind === 'cancelled')) {
      const shopText = [
        `${kind === 'placed' ? 'New order' : kind === 'paid' ? 'Payment received' : 'Order cancelled'}: ${order.orderNumber}`,
        `Customer: ${order.name}, ${order.email}`,
        `Payment: ${order.paymentMethod === 'paypal' ? 'PayPal' : 'Bank transfer'}, ${order.paymentState}`,
        `Total: ${formatPrice(toCents(order.total), order.currency)}`,
        '',
        'Open the admin to see the full order.',
      ].join('\n');
      sends.push(
        mailer.send({
          to: settings.shopEmail,
          subject: `[Shop] ${SUBJECTS[kind](order.orderNumber)}`,
          text: shopText,
          replyTo: order.email,
          attachments: invoice,
        }),
      );
    }
    // An email failure must never undo an order that is already saved.
    const results = await Promise.allSettled(sends);
    for (const result of results) {
      if (result.status === 'rejected')
        logger.error('order email failed', { kind, orderNumber: order.orderNumber });
    }
  }

  return { orderEmails };
}

export type Notifications = ReturnType<typeof createNotifications>;
