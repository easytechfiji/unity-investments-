import { centsToDecimal, toCents, type OrderSummary } from '@od/shared';
import { renderDocumentPdf, type PdfBusiness, type PdfLine } from './documentPdf.js';

// The invoice for a website order. It uses the same design as the invoices the
// admin issues by hand (documentPdf.ts), so every invoice from the shop matches.
// It is drawn on demand, in memory, and never written to disk or a public folder
// (the old site saved every invoice where anyone could fetch it).
//
// It keeps the order number (for example 100023) rather than an INV number: the
// website's orders have their own numbering.

export function renderInvoice(order: OrderSummary, business: PdfBusiness): Promise<Buffer> {
  const lines: PdfLine[] = order.items.map((item) => ({
    description: [item.name, item.variant, item.sku ? `SKU ${item.sku}` : null]
      .filter(Boolean)
      .join(', '),
    hsCode: null,
    unit: null,
    qty: String(item.quantity),
    unitPrice: item.unitPrice,
    amount: item.lineTotal,
  }));
  if (toCents(order.shipping) > 0) {
    lines.push({
      description: `Delivery${order.shippingRegion ? `, ${order.shippingRegion}` : ''}`,
      hsCode: null,
      unit: null,
      qty: '1',
      unitPrice: order.shipping,
      amount: order.shipping,
    });
  }
  const tax = toCents(order.tax);
  const total = toCents(order.total);
  const zero = '0.00';

  // Bank details only when the customer still has to pay by bank transfer.
  const bank = order.bankDetails;
  const shownBusiness: PdfBusiness = {
    ...business,
    bankAccountName: bank?.accountName ?? null,
    bankName: bank?.bankName ?? null,
    bankBranchCode: bank?.branchCode ?? null,
    bankAccountNumber: bank?.accountNumber ?? null,
    bankSwift: null,
    mpaisa: null,
  };

  const payment =
    order.paymentMethod === 'paypal'
      ? `PayPal, ${order.paymentState}${order.charge ? ` (charged ${order.charge.currency} ${order.charge.amount})` : ''}`
      : `Bank transfer, ${order.paymentState}`;

  return renderDocumentPdf(
    {
      type: 'invoice',
      number: order.orderNumber,
      // The date in Fiji, not UTC (a morning order in Fiji is still yesterday in UTC).
      issueDate: new Date(order.createdAt).toLocaleDateString('en-CA', {
        timeZone: 'Pacific/Fiji',
      }),
      party: {
        name: order.name,
        email: order.email,
        address:
          order.deliveryMethod === 'shipping' ? order.address : 'Click And Collect from the shop',
      },
      fields: {
        payment_method: payment,
        payment_reference: bank ? order.orderNumber : null,
      },
      currency: order.currency,
      lines,
      totals: {
        subtotal: centsToDecimal(total - tax),
        vat: order.tax,
        freight: zero,
        insurance: zero,
        other_charges: zero,
        total: order.total,
        deposit: zero,
        balance: zero,
      },
      vatEnabled: tax > 0,
      pricesIncludeVat: false,
      terms: [],
    },
    shownBusiness,
  );
}
