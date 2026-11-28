import { amountInWords, DOCUMENT_LABELS, toCents, type DocumentType } from '@od/shared';
import PDFDocument from 'pdfkit';
import { DOCUMENT_LOGO_PNG, DOCUMENT_LOGO_RATIO } from './documentLogo.js';

// Draws invoices, official receipts, proforma invoices and order forms as one A4
// PDF each, in the design of the shop's paper forms (docs/forms/make_forms.py):
// wide logo top left, title top right with an orange underline, contact block, blue
// rule, party box, number and date box, item table with a dark header and striped
// rows, totals with a blue total row, payment details, numbered terms, signature
// lines and the three colour strip at the foot of the page.
//
// Every business detail comes from the database (site_settings), never from code.

const BLUE = '#3C7DC7';
const ORANGE = '#F9A72B';
const GREY = '#A7A6A6';
const INK = '#3F3F3F';
const SOFT = '#F4F6FA';
const LINE = '#C9CDD3';
const RED = '#C0392B';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 36;
const CW = PAGE_W - 2 * M;
/** Lowest y content may reach before the footer strip. */
const BOTTOM = PAGE_H - 44;

export interface PdfBusiness {
  siteName: string;
  legalName: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  tin: string | null;
  bankAccountName: string | null;
  bankName: string | null;
  bankBranchCode: string | null;
  bankAccountNumber: string | null;
  bankSwift: string | null;
  mpaisa: string | null;
}

export interface PdfParty {
  name: string;
  contact_person?: string | null;
  address?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  tin?: string | null;
}

export interface PdfLine {
  description: string;
  hsCode: string | null;
  unit: string | null;
  qty: string;
  unitPrice: string;
  amount: string;
}

export interface PdfDocumentData {
  type: DocumentType;
  /** "INV-0001", or "PREVIEW" before it is issued. */
  number: string;
  issueDate: string;
  party: PdfParty;
  fields: Record<string, string | null | undefined>;
  currency: string;
  lines: PdfLine[];
  totals: {
    subtotal: string;
    vat: string;
    freight: string;
    insurance: string;
    other_charges: string;
    total: string;
    deposit: string;
    balance: string;
  };
  /** VAT charged on this document at all. */
  vatEnabled: boolean;
  pricesIncludeVat: boolean;
  terms: string[];
  /** For a receipt that pays an invoice: that invoice's number. */
  invoiceNumber?: string | null;
  /** Set on a void document: printed across every page. */
  voidReason?: string | null;
  preview?: boolean;
}

/** "1234.5" style decimal to "1,234.50". */
function amount(value: string): string {
  const cents = toCents(value);
  const whole = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${whole}.${String(cents % 100).padStart(2, '0')}`;
}

/** "2.500" to "2.5", "3.000" to "3". */
function qty(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

/** 2026-11-29 to 29 November 2026. */
function longDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-NZ', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const TITLES: Record<DocumentType, string> = {
  invoice: 'INVOICE',
  receipt: 'OFFICIAL RECEIPT',
  proforma: 'PROFORMA INVOICE',
  order: 'ORDER FORM',
};

export function renderDocumentPdf(data: PdfDocumentData, business: PdfBusiness): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      autoFirstPage: true,
      bufferPages: true,
      info: {
        Title: `${DOCUMENT_LABELS[data.type]} ${data.number}`,
        Author: business.legalName ?? business.siteName,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      draw(doc, data, business);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    doc.end();
  });
}

type Doc = PDFKit.PDFDocument;

function draw(doc: Doc, data: PdfDocumentData, business: PdfBusiness): void {
  const company = business.legalName ?? business.siteName;
  const font = (size: number, bold = false, color = INK) =>
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(size)
      .fillColor(color);

  /** Label in bold followed by its value, or a fill-in line if there is none. */
  const field = (
    x: number,
    y: number,
    w: number,
    label: string,
    value?: string | null,
    size = 8.5,
  ) => {
    font(size, true);
    doc.text(label, x, y, { lineBreak: false });
    const lx = x + doc.widthOfString(label) + 4;
    if (value) {
      font(size);
      doc.text(value, lx, y, { width: Math.max(10, x + w - lx), height: size + 3, ellipsis: true });
    } else {
      doc
        .moveTo(lx, y + size + 1)
        .lineTo(x + w, y + size + 1)
        .lineWidth(0.6)
        .strokeColor(LINE)
        .stroke();
    }
  };

  const box = (x: number, y: number, w: number, h: number, fill?: string, stroke = LINE) => {
    doc.lineWidth(0.7).roundedRect(x, y, w, h, 4);
    if (fill) doc.fillAndStroke(fill, stroke);
    else doc.strokeColor(stroke).stroke();
  };

  const sectionLabel = (x: number, y: number, text: string, color = BLUE) => {
    font(8, true, color);
    doc.text(text.toUpperCase(), x, y, { lineBreak: false, characterSpacing: 0.4 });
  };

  // Header: logo, title, contact block and the blue rule. Returns the y below it.
  const header = (): number => {
    const logoW = 200;
    const logoH = logoW * DOCUMENT_LOGO_RATIO;
    doc.image(DOCUMENT_LOGO_PNG, M, M, { width: logoW });
    const right = M + CW;
    font(data.type === 'proforma' || data.type === 'receipt' ? 19 : 22, true);
    doc.text(TITLES[data.type], M + 200, M, { width: CW - 200, align: 'right', lineBreak: false });
    doc.rect(right - 60, M + 27, 60, 3).fill(ORANGE);
    let y = M + 40;
    font(8);
    const where = [business.address, business.website?.replace(/^https?:\/\//, '')]
      .filter(Boolean)
      .join('   |   ');
    if (where) {
      doc.text(where, M + 200, y, { width: CW - 200, align: 'right', lineBreak: false });
      y += 12;
    }
    const contact: [string, string | null][] = [
      ['Phone:', [business.phone, business.phone2].filter(Boolean).join(' / ') || null],
      ['Email:', business.email],
      ['TIN:', business.tin],
    ];
    for (const [label, value] of contact) {
      if (!value) continue;
      font(8, true);
      const labelW = doc.widthOfString(`${label} `);
      font(8);
      const valueW = doc.widthOfString(value);
      const x = right - labelW - valueW;
      font(8, true);
      doc.text(label, x, y, { lineBreak: false });
      font(8);
      doc.text(value, x + labelW, y, { lineBreak: false });
      y += 11;
    }
    const bottom = Math.max(M + logoH, y) + 6;
    doc.moveTo(M, bottom).lineTo(right, bottom).lineWidth(1.4).strokeColor(BLUE).stroke();
    return bottom + 12;
  };

  // A continuation page: a slim header with the title and number.
  const continuationHeader = (): number => {
    font(10, true);
    doc.text(`${TITLES[data.type]} ${data.number} (continued)`, M, M, {
      width: CW,
      lineBreak: false,
    });
    doc
      .moveTo(M, M + 18)
      .lineTo(M + CW, M + 18)
      .lineWidth(1)
      .strokeColor(BLUE)
      .stroke();
    return M + 30;
  };

  let y = header();
  const newPage = () => {
    doc.addPage({ size: 'A4', margin: 0 });
    y = continuationHeader();
  };
  const ensure = (space: number) => {
    if (y + space > BOTTOM) newPage();
  };

  const p = data.party;
  const f = data.fields;
  const partyLines: [string, string | null | undefined][] = [];

  if (data.type === 'receipt') {
    drawReceipt();
  } else {
    // Party box and number box, side by side.
    const lw = CW * 0.6 - 8;
    const partyTitle =
      data.type === 'proforma'
        ? 'Buyer / Consignee'
        : data.type === 'order'
          ? 'Customer'
          : 'Bill to';
    partyLines.push(
      [data.type === 'proforma' ? 'Company:' : 'Customer:', p.name],
      ['Attention:', p.contact_person],
      ['Address:', p.address],
      [
        data.type === 'proforma' ? 'Country:' : 'Phone:',
        data.type === 'proforma' ? p.country : p.phone,
      ],
      [
        data.type === 'proforma' ? 'Contact / Phone:' : 'Email:',
        data.type === 'proforma' ? p.phone : p.email,
      ],
    );
    if (data.type === 'invoice') partyLines.push(['Customer TIN:', p.tin]);
    if (data.type === 'order') partyLines.push(['Deliver to:', f.deliver_to]);
    const shown = partyLines.filter(([, value]) => value);
    const partyH = 18 * Math.max(shown.length, 3) + 24;

    const meta: [string, string | null | undefined][] =
      data.type === 'invoice'
        ? [
            ['Invoice No.:', data.number],
            ['Date:', longDate(data.issueDate)],
            ['PO No.:', f.po_number],
          ]
        : data.type === 'order'
          ? [
              ['Order No.:', data.number],
              ['Date:', longDate(data.issueDate)],
              ['Required by:', longDate(f.required_by)],
              ['Taken by:', f.taken_by],
            ]
          : [
              ['Proforma No.:', data.number],
              ['Date:', longDate(data.issueDate)],
              ['Valid until:', longDate(f.valid_until)],
              ['Buyer ref / PO:', f.buyer_ref],
              ['Currency:', data.currency],
            ];
    const metaH = Math.max(16 * meta.length + 12, partyH);

    box(M, y, lw, Math.max(partyH, metaH));
    sectionLabel(M + 8, y + 9, partyTitle);
    let py = y + 26;
    for (const [label, value] of shown) {
      field(M + 8, py, lw - 16, label, value);
      py += 18;
    }
    const mx = M + lw + 16;
    const mw = CW - lw - 16;
    box(mx, y, mw, Math.max(partyH, metaH), SOFT);
    let my = y + 10;
    for (const [label, value] of meta) {
      field(mx + 8, my, mw - 16, label, value);
      my += 16;
    }
    y += Math.max(partyH, metaH) + 12;

    if (data.type === 'proforma') {
      // Trade terms strip.
      const th = 42;
      box(M, y, CW, th, SOFT);
      const third = CW / 3;
      const terms: [string, string | null | undefined, string, string | null | undefined][] = [
        ['Incoterms:', f.incoterms, 'Port of loading:', f.port_loading],
        ['Payment terms:', f.payment_terms, 'Port of discharge:', f.port_discharge],
        ['Shipment by:', f.shipment_by, 'Country of origin:', f.country_origin],
      ];
      terms.forEach(([a, av, b, bv], i) => {
        field(M + 8 + i * third, y + 9, third - 18, a, av);
        field(M + 8 + i * third, y + 25, third - 18, b, bv);
      });
      y += th + 12;
    }

    drawItems();
    drawTotalsAndPayment();
    drawTerms();
    drawSignatures(
      data.type === 'proforma'
        ? ['Authorised signature and company stamp', 'Name', 'Date']
        : data.type === 'order'
          ? ['Order taken by', 'Customer signature', 'Date']
          : ['Issued by', 'Received by', 'Date'],
    );
  }

  function drawItems(): void {
    const proforma = data.type === 'proforma';
    const priceHead = proforma ? `Unit price (${data.currency})` : 'Unit price (FJD)';
    const amountHead = proforma ? `Amount (${data.currency})` : 'Amount (FJD)';
    const cols: { head: string; w: number; align: 'left' | 'right' | 'center' }[] = proforma
      ? [
          { head: '#', w: 24, align: 'center' },
          { head: 'Description of goods', w: 185, align: 'left' },
          { head: 'HS code', w: 60, align: 'center' },
          { head: 'Qty', w: 45, align: 'right' },
          { head: 'Unit', w: 40, align: 'center' },
          { head: priceHead, w: 85, align: 'right' },
          { head: amountHead, w: CW - 439, align: 'right' },
        ]
      : [
          { head: '#', w: 26, align: 'center' },
          { head: 'Description', w: 265, align: 'left' },
          { head: 'Qty', w: 50, align: 'right' },
          { head: priceHead, w: 90, align: 'right' },
          { head: amountHead, w: CW - 431, align: 'right' },
        ];
    const headH = 20;

    const drawHead = () => {
      doc.rect(M, y, CW, headH).fill(INK);
      font(8, true, '#FFFFFF');
      let cx = M;
      for (const col of cols) {
        doc.text(col.head, cx + 6, y + 6.5, {
          width: col.w - 12,
          align: col.align,
          lineBreak: false,
        });
        cx += col.w;
      }
      y += headH;
    };

    ensure(headH + 20);
    drawHead();
    let tableTop = y - headH;
    const finishGrid = () => {
      doc
        .lineWidth(0.6)
        .strokeColor(LINE)
        .rect(M, tableTop, CW, y - tableTop)
        .stroke();
      let cx = M;
      for (const col of cols.slice(0, -1)) {
        cx += col.w;
        doc
          .moveTo(cx, tableTop + headH)
          .lineTo(cx, y)
          .stroke();
      }
    };

    data.lines.forEach((line, index) => {
      const descW = (cols[1]?.w ?? 200) - 12;
      font(8.5);
      const textH = doc.heightOfString(line.description, { width: descW });
      const rowH = Math.max(19, textH + 9);
      if (y + rowH > BOTTOM) {
        finishGrid();
        newPage();
        drawHead();
        tableTop = y - headH;
      }
      if (index % 2) doc.rect(M, y, CW, rowH).fill(SOFT);
      const cells = proforma
        ? [
            String(index + 1),
            line.description,
            line.hsCode ?? '',
            qty(line.qty),
            line.unit ?? '',
            amount(line.unitPrice),
            amount(line.amount),
          ]
        : [
            String(index + 1),
            line.description,
            qty(line.qty),
            amount(line.unitPrice),
            amount(line.amount),
          ];
      let cx = M;
      cols.forEach((col, i) => {
        if (i === 0) font(7.5, false, GREY);
        else font(8.5);
        doc.text(cells[i] ?? '', cx + 6, y + 5, {
          width: col.w - 12,
          align: col.align,
          lineBreak: i === 1,
        });
        cx += col.w;
      });
      y += rowH;
    });
    finishGrid();
    y += 6;
  }

  function drawTotalsAndPayment(): void {
    const t = data.totals;
    const rows: { label: string; value: string; grand?: boolean }[] =
      data.type === 'proforma'
        ? [
            { label: 'Subtotal', value: t.subtotal },
            { label: 'Freight', value: t.freight },
            { label: 'Insurance', value: t.insurance },
            { label: 'Other charges', value: t.other_charges },
            { label: `TOTAL (${data.currency})`, value: t.total, grand: true },
          ]
        : [
            { label: 'Subtotal (VEP)', value: t.subtotal },
            { label: 'VAT', value: t.vat },
            { label: 'TOTAL (VIP)', value: t.total, grand: true },
            ...(data.type === 'order'
              ? [
                  { label: 'Deposit paid', value: t.deposit },
                  { label: 'BALANCE DUE', value: t.balance, grand: true },
                ]
              : []),
          ];
    const tw = 200;
    const rowH = 18;
    const totalsH = rows.reduce((sum, row) => sum + (row.grand ? rowH + 2 : rowH), 0);
    const payH = 100;
    ensure(Math.max(totalsH, payH) + 8);
    const top = y;

    // Totals, right.
    let ty = top;
    const tx = M + CW - tw;
    for (const row of rows) {
      if (row.grand) {
        doc.rect(tx, ty, tw, rowH + 2).fill(BLUE);
        font(9, true, '#FFFFFF');
        doc.text(row.label, tx + 8, ty + 6, { lineBreak: false });
        doc.text(amount(row.value), tx + 8, ty + 6, {
          width: tw - 16,
          align: 'right',
          lineBreak: false,
        });
        ty += rowH + 2;
      } else {
        font(8.5, true);
        doc.text(row.label, tx + 8, ty + 5, { lineBreak: false });
        font(8.5);
        doc.text(amount(row.value), tx + 8, ty + 5, {
          width: tw - 16,
          align: 'right',
          lineBreak: false,
        });
        doc
          .moveTo(tx, ty + rowH)
          .lineTo(tx + tw, ty + rowH)
          .lineWidth(0.6)
          .strokeColor(LINE)
          .stroke();
        ty += rowH;
      }
    }
    if (data.type !== 'proforma') {
      font(7, false, GREY);
      doc.text(
        !data.vatEnabled
          ? 'No VAT charged.'
          : data.pricesIncludeVat
            ? 'Prices include VAT.'
            : 'VAT added to the prices above.',
        tx,
        ty + 4,
        { width: tw, align: 'right' },
      );
      ty += 14;
    }

    // Payment details and method, left.
    const bw = CW - tw - 14;
    let ly = top;
    const method =
      data.type === 'invoice'
        ? f.payment_method
          ? `${f.payment_method}${f.payment_reference ? `, ref ${f.payment_reference}` : ''}`
          : null
        : data.type === 'order'
          ? f.deposit_method
            ? `Deposit paid by ${f.deposit_method}`
            : null
          : null;
    if (method) {
      field(M, ly, bw, data.type === 'order' ? 'Deposit:' : 'Payment:', method);
      ly += 16;
    }
    const bank: [string, string | null][] = [
      ['Account name:', business.bankAccountName],
      ['Bank:', business.bankName],
      ['Branch code:', business.bankBranchCode],
      ['Account no.:', business.bankAccountNumber],
      ...(data.type === 'proforma'
        ? ([['SWIFT / BIC:', business.bankSwift]] as [string, string | null][])
        : []),
      ['M-PAiSA no.:', business.mpaisa],
    ];
    const bankRows = bank.filter(([, value]) => value);
    if (bankRows.length) {
      const bh = 24 + 13.5 * bankRows.length;
      box(M, ly, bw, bh, SOFT);
      sectionLabel(M + 8, ly + 9, 'Payment details');
      let by = ly + 24;
      for (const [label, value] of bankRows) {
        field(M + 8, by, bw - 16, label, value, 8);
        by += 13.5;
      }
      ly += bh;
    }
    if (f.notes) {
      ly += 8;
      font(8, true);
      doc.text('Notes:', M, ly, { lineBreak: false });
      font(8);
      doc.text(f.notes, M + 34, ly, { width: bw - 34 });
      ly = doc.y;
    }
    y = Math.max(ty, ly) + 14;
  }

  function drawTerms(): void {
    if (!data.terms.length) return;
    font(7.5);
    const heights = data.terms.map((term) => doc.heightOfString(term, { width: CW - 30 }) + 2);
    const h = 26 + heights.reduce((sum, value) => sum + value, 0);
    ensure(Math.min(h, BOTTOM - M - 40));
    box(M, y, CW, h);
    sectionLabel(M + 8, y + 9, 'Terms and conditions');
    let ty = y + 24;
    data.terms.forEach((term, i) => {
      font(7.5);
      doc.text(`${i + 1}.`, M + 8, ty, { lineBreak: false });
      doc.text(term, M + 20, ty, { width: CW - 30 });
      ty += heights[i] ?? 10;
    });
    y += h + 10;
  }

  function drawSignatures(labels: string[]): void {
    ensure(50);
    const sy = Math.min(Math.max(y + 34, BOTTOM - 30), BOTTOM - 6);
    const widths = [180, 150, 120];
    let sx = M;
    labels.forEach((label, i) => {
      const w = widths[i] ?? 120;
      doc
        .moveTo(sx, sy)
        .lineTo(sx + w, sy)
        .lineWidth(0.7)
        .strokeColor(INK)
        .stroke();
      font(7.5, false, GREY);
      doc.text(label, sx, sy + 4, { lineBreak: false });
      sx += w + 40;
    });
    y = sy + 20;
  }

  function drawReceipt(): void {
    const lw = CW * 0.6 - 8;
    const h = 92;
    box(M, y, lw, h);
    sectionLabel(M + 8, y + 9, 'Received from');
    let py = y + 26;
    for (const [label, value] of [
      ['Name:', p.name],
      ['Address:', p.address],
      ['Phone / Email:', [p.phone, p.email].filter(Boolean).join(' / ') || null],
    ] as [string, string | null | undefined][]) {
      field(M + 8, py, lw - 16, label, value);
      py += 18;
    }
    const mx = M + lw + 16;
    const mw = CW - lw - 16;
    box(mx, y, mw, h, SOFT);
    field(mx + 8, y + 12, mw - 16, 'Receipt No.:', data.number);
    field(mx + 8, y + 30, mw - 16, 'Date:', longDate(data.issueDate));
    if (data.invoiceNumber) field(mx + 8, y + 48, mw - 16, 'For invoice:', data.invoiceNumber);
    y += h + 18;

    const words = amountInWords(toCents(data.totals.total), data.currency);
    field(M, y, CW, 'The sum of:', words);
    y += 22;
    const forWhat = [
      data.invoiceNumber ? `Invoice ${data.invoiceNumber}` : null,
      f.being_payment_for,
    ]
      .filter(Boolean)
      .join(': ');
    field(M, y, CW, 'Being payment for:', forWhat || null);
    y += 22;
    field(M, y, CW * 0.5, 'Paid by:', f.paid_by);
    y += 22;
    field(M, y, CW * 0.7, 'Cheque / Ref / M-PAiSA txn no.:', f.reference);
    y += 30;

    // Amount box.
    const bw = 220;
    const bh = 34;
    const bx = M + CW - bw;
    box(bx, y, bw, bh, undefined, BLUE);
    doc.roundedRect(bx, y, 56, bh, 4).fill(BLUE);
    font(10, true, '#FFFFFF');
    doc.text(data.currency === 'FJD' ? 'FJD $' : data.currency, bx, y + 12, {
      width: 56,
      align: 'center',
      lineBreak: false,
    });
    font(14, true);
    doc.text(amount(data.totals.total), bx + 64, y + 10, {
      width: bw - 74,
      align: 'right',
      lineBreak: false,
    });
    if (f.notes) {
      font(8, true);
      doc.text('Notes:', M, y + 4, { lineBreak: false });
      font(8);
      doc.text(f.notes, M + 34, y + 4, { width: CW - bw - 50 });
    }
    y += bh + 40;
    drawSignatures(['Received by (signature)', 'Name', 'Date']);
    font(7, false, GREY);
    doc.text(
      'Valid only when signed. Cheques subject to clearance. Deposits on confirmed orders are non-refundable.',
      M,
      y,
      { width: CW },
    );
  }

  // On every page: the footer strip, page numbers, and the VOID or PREVIEW mark.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.rect(0, PAGE_H - 6, PAGE_W * 0.6, 6).fill(BLUE);
    doc.rect(PAGE_W * 0.6, PAGE_H - 6, PAGE_W * 0.25, 6).fill(ORANGE);
    doc.rect(PAGE_W * 0.85, PAGE_H - 6, PAGE_W * 0.15, 6).fill(GREY);
    font(8, false, GREY);
    const site = business.website?.replace(/^https?:\/\//, '');
    doc.text(
      ['Thank you for your business.', company, site].filter(Boolean).join('   •   '),
      M,
      PAGE_H - 24,
      { width: CW, align: 'center', lineBreak: false },
    );
    if (range.count > 1) {
      doc.text(`Page ${i + 1} of ${range.count}`, M, PAGE_H - 24, {
        width: CW,
        align: 'right',
        lineBreak: false,
      });
    }
    const mark = data.voidReason ? 'VOID' : data.preview ? 'PREVIEW' : null;
    if (mark) {
      doc.save();
      doc.rotate(-35, { origin: [PAGE_W / 2, PAGE_H / 2] });
      doc
        .font('Helvetica-Bold')
        .fontSize(120)
        .fillColor(data.voidReason ? RED : GREY)
        .fillOpacity(0.22)
        .text(mark, 0, PAGE_H / 2 - 60, { width: PAGE_W, align: 'center', lineBreak: false });
      doc.restore();
      doc.fillOpacity(1);
      if (data.voidReason) {
        font(9, true, RED);
        doc.text(`VOID: ${data.voidReason}`, M, PAGE_H - 38, {
          width: CW,
          align: 'center',
          lineBreak: false,
        });
      }
    }
  }
}
