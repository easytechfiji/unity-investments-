'use client';

import { formatPrice, toCents, type OrderSummary } from '@od/shared';
import Link from 'next/link';
import { useState } from 'react';
import { PUBLIC_API_URL } from '../lib/config';

const money = (value: string) => formatPrice(toCents(value));

const PAYMENT_TEXT: Record<OrderSummary['paymentState'], string> = {
  awaiting: 'Waiting for payment',
  paid: 'Paid',
  failed: 'Payment failed',
  refunded: 'Refunded',
};

const ORDER_TEXT: Record<OrderSummary['orderState'], string> = {
  pending: 'Received',
  processing: 'Being prepared',
  completed: 'Complete',
  cancelled: 'Cancelled',
};

/** A customer's own order: what happens next, the bank details if needed, and a printable summary. */
export function OrderView({ order, email }: { order: OrderSummary; email: string }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadInvoice() {
    setDownloading(true);
    setError(null);
    try {
      const response = await fetch(`${PUBLIC_API_URL}/v1/orders/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: order.reference, email }),
      });
      if (!response.ok) throw new Error('download failed');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${order.orderNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('The invoice could not be downloaded. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  const bank = order.bankDetails;
  return (
    <div className="prose order-view">
      <dl className="spec">
        <dt>Order number</dt>
        <dd>{order.orderNumber}</dd>
        <dt>Status</dt>
        <dd>{ORDER_TEXT[order.orderState]}</dd>
        <dt>Payment</dt>
        <dd>
          {order.paymentMethod === 'paypal' ? 'PayPal' : 'Bank transfer'},{' '}
          {PAYMENT_TEXT[order.paymentState].toLowerCase()}
        </dd>
        <dt>{order.deliveryMethod === 'shipping' ? 'Delivery to' : 'Collection'}</dt>
        <dd>
          {order.deliveryMethod === 'shipping'
            ? `${order.address ?? ''}${order.shippingRegion ? ` (${order.shippingRegion})` : ''}`
            : 'Click And Collect from our shop in Nakasi. We will contact you when it is ready.'}
        </dd>
      </dl>

      {!bank &&
      order.paymentMethod === 'bank_transfer' &&
      order.paymentState === 'awaiting' &&
      order.orderState !== 'cancelled' ? (
        <p className="notice">
          To pay, <Link href="/contact_us">contact us</Link> for our bank details. Use{' '}
          <strong>{order.orderNumber}</strong> as the payment reference.
        </p>
      ) : null}
      {bank ? (
        <section aria-labelledby="pay-title">
          <h2 id="pay-title">How to pay</h2>
          <p>
            Pay <strong>{money(order.total)}</strong> by bank transfer. Use{' '}
            <strong>{order.orderNumber}</strong> as the payment reference so we can match your
            payment. We start preparing your order once the payment reaches our account.
          </p>
          <div className="bank-details">
            <dl>
              {bank.accountName ? (
                <>
                  <dt>Account name</dt>
                  <dd>{bank.accountName}</dd>
                </>
              ) : null}
              {bank.bankName ? (
                <>
                  <dt>Bank</dt>
                  <dd>{bank.bankName}</dd>
                </>
              ) : null}
              {bank.branchCode ? (
                <>
                  <dt>Branch code</dt>
                  <dd>{bank.branchCode}</dd>
                </>
              ) : null}
              {bank.accountNumber ? (
                <>
                  <dt>Account number</dt>
                  <dd>{bank.accountNumber}</dd>
                </>
              ) : null}
              <dt>Reference</dt>
              <dd>{order.orderNumber}</dd>
            </dl>
          </div>
        </section>
      ) : null}

      <h2>Items</h2>
      <table className="summary-table">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" className="num">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, index) => (
            <tr key={index}>
              <td>
                {item.quantity} x {item.name}
                {item.variant ? `, ${item.variant}` : ''}
                {item.sku ? <div className="sku">SKU {item.sku}</div> : null}
              </td>
              <td className="num">{money(item.lineTotal)}</td>
            </tr>
          ))}
          <tr>
            <td>Subtotal</td>
            <td className="num">{money(order.subtotal)}</td>
          </tr>
          <tr>
            <td>Delivery</td>
            <td className="num">{money(order.shipping)}</td>
          </tr>
          {toCents(order.tax) > 0 ? (
            <tr>
              <td>Tax</td>
              <td className="num">{money(order.tax)}</td>
            </tr>
          ) : null}
          <tr>
            <th scope="row">Total (FJD)</th>
            <td className="num">
              <strong>{money(order.total)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      {order.charge ? (
        <p className="hint">
          PayPal charged {order.charge.currency} {order.charge.amount} at {order.charge.rate} per
          FJD.
        </p>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="no-print hours">
        <button className="btn btn-plain" type="button" onClick={() => window.print()}>
          Print this page
        </button>{' '}
        <button
          className="btn btn-plain"
          type="button"
          onClick={() => void downloadInvoice()}
          disabled={downloading}
        >
          {downloading ? 'Preparing invoice' : 'Download invoice (PDF)'}
        </button>
      </p>
      <p className="hint">Keep your order reference: {order.reference}</p>
    </div>
  );
}
