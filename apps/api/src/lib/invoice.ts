import { formatPrice, toCents, type OrderSummary } from '@od/shared';
import PDFDocument from 'pdfkit';

// Invoices are drawn on demand, in memory. They are never written to disk or to
// a public folder (the old site saved every invoice where anyone could fetch it).

const NAVY = '#003a6c';

export interface InvoiceShop {
  siteName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export function renderInvoice(order: OrderSummary, shop: InvoiceShop): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: { Title: `Invoice ${order.orderNumber}`, Author: shop.siteName },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const money = (value: string) => formatPrice(toCents(value), order.currency);
    const right = 545;

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(16).text(shop.siteName, 50, 50);
    doc.fillColor('#1a1a1a').font('Helvetica').fontSize(9);
    for (const line of [shop.address, shop.phone, shop.email]) if (line) doc.text(line);

    doc
      .font('Helvetica-Bold')
      .fontSize(20)
      .text('Invoice', 350, 50, { width: 195, align: 'right' });
    doc.font('Helvetica').fontSize(9);
    doc.text(`Order ${order.orderNumber}`, 350, 78, { width: 195, align: 'right' });
    doc.text(
      new Date(order.createdAt).toLocaleDateString('en-NZ', {
        timeZone: 'Pacific/Fiji',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      {
        width: 195,
        align: 'right',
      },
    );
    doc.text(
      `Payment: ${order.paymentMethod === 'paypal' ? 'PayPal' : 'Bank transfer'}, ${order.paymentState}`,
      { width: 195, align: 'right' },
    );

    doc.moveDown(3);
    let y = Math.max(doc.y, 140);
    doc.font('Helvetica-Bold').text('Bill to', 50, y);
    doc.font('Helvetica').text(order.name).text(order.email);
    doc
      .font('Helvetica-Bold')
      .text(order.deliveryMethod === 'shipping' ? 'Deliver to' : 'Collection', 300, y);
    doc
      .font('Helvetica')
      .text(
        order.deliveryMethod === 'shipping'
          ? `${order.address ?? ''}\n${order.shippingRegion ?? ''}`
          : 'Click And Collect from the shop',
        300,
        undefined,
        { width: 245 },
      );

    y = Math.max(doc.y, 230) + 20;
    const columns = { item: 50, qty: 330, unit: 390, total: 470 };
    doc.font('Helvetica-Bold');
    doc
      .text('Item', columns.item, y)
      .text('Qty', columns.qty, y)
      .text('Unit price', columns.unit, y);
    doc.text('Total', columns.total, y, { width: right - columns.total, align: 'right' });
    doc
      .moveTo(50, y + 14)
      .lineTo(right, y + 14)
      .strokeColor('#999999')
      .stroke();
    y += 22;
    doc.font('Helvetica');
    for (const item of order.items) {
      const label = [item.name, item.variant, item.sku ? `SKU ${item.sku}` : null]
        .filter(Boolean)
        .join('\n');
      doc.text(label, columns.item, y, { width: 270 });
      const rowBottom = doc.y;
      doc.text(String(item.quantity), columns.qty, y);
      doc.text(money(item.unitPrice), columns.unit, y);
      doc.text(money(item.lineTotal), columns.total, y, {
        width: right - columns.total,
        align: 'right',
      });
      y = Math.max(rowBottom, y + 14) + 6;
      if (y > 720) {
        doc.addPage();
        y = 50;
      }
    }
    doc.moveTo(330, y).lineTo(right, y).strokeColor('#999999').stroke();
    y += 8;
    const totalLine = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
      doc
        .text(label, 330, y)
        .text(value, columns.total, y, { width: right - columns.total, align: 'right' });
      y += 16;
    };
    totalLine('Subtotal', money(order.subtotal));
    totalLine('Delivery', money(order.shipping));
    if (toCents(order.tax) > 0) totalLine('Tax', money(order.tax));
    totalLine(`Total (${order.currency})`, money(order.total), true);
    if (order.charge) {
      doc.font('Helvetica').fontSize(8);
      doc.text(
        `Charged by PayPal as ${order.charge.currency} ${order.charge.amount} at ${order.charge.rate} per FJD.`,
        330,
        y,
        { width: 215 },
      );
      doc.fontSize(9);
      y = doc.y + 8;
    }

    if (order.bankDetails) {
      y += 16;
      doc.font('Helvetica-Bold').text('Pay by bank transfer', 50, y);
      doc.font('Helvetica');
      const bank = order.bankDetails;
      for (const [label, value] of [
        ['Account name', bank.accountName],
        ['Bank', bank.bankName],
        ['Branch code', bank.branchCode],
        ['Account number', bank.accountNumber],
        ['Payment reference', order.orderNumber],
      ] as const) {
        if (value) doc.text(`${label}: ${value}`);
      }
    }

    doc.end();
  });
}
