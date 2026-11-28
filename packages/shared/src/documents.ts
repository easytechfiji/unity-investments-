// Documents the admin issues by hand: invoices, official receipts, proforma invoices and
// order forms. The totals here are used twice: by the admin page to show totals while
// typing, and by the API to calculate the real totals that are saved (the API never
// trusts totals sent by the browser). All money is whole cents.

import { centsToDecimal, toCents } from './money.js';

export const DOCUMENT_TYPES = ['invoice', 'receipt', 'proforma', 'order'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  invoice: 'Invoice',
  receipt: 'Official receipt',
  proforma: 'Proforma invoice',
  order: 'Order form',
};

export const DOCUMENT_PREFIXES: Record<DocumentType, string> = {
  invoice: 'INV',
  receipt: 'RCT',
  proforma: 'PRO',
  order: 'ORD',
};

/** 7 to "INV-0007". Numbers past 9999 simply grow: "INV-12345". */
export function documentNumber(type: DocumentType, number: number): string {
  return `${DOCUMENT_PREFIXES[type]}-${String(number).padStart(4, '0')}`;
}

export const INVOICE_PAYMENT_METHODS = [
  'Cash',
  'Cheque',
  'Transfer',
  'Account',
  'M-PAiSA',
] as const;
export const RECEIPT_PAYMENT_METHODS = [
  'Cash',
  'Cheque',
  'Bank transfer',
  'EFTPOS',
  'M-PAiSA',
] as const;
export const DEPOSIT_METHODS = ['Cash', 'Cheque', 'Transfer', 'EFTPOS', 'M-PAiSA'] as const;

const QTY = /^\d{1,9}(\.\d{1,3})?$/;

/** "2" or "1.5" to thousandths (2000, 1500). Quantities allow three decimals (metres, kilograms). */
export function qtyToMilli(value: string): number {
  const text = value.trim();
  if (!QTY.test(text)) throw new Error(`Not a quantity: ${JSON.stringify(value)}`);
  const [whole = '0', fraction = ''] = text.split('.');
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}

/** Line amount: quantity times unit price, rounded half up to the cent. */
export function lineAmountCents(qty: string, unitPrice: string): number {
  const product = BigInt(qtyToMilli(qty)) * BigInt(toCents(unitPrice));
  return Number((product + 500n) / 1000n);
}

/** A VAT rate such as "12.5" to hundredths of a percent (1250), so no floating point is used. */
export function rateToBasisPoints(rate: string): number {
  const text = rate.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) throw new Error('Invalid VAT rate');
  const [whole = '0', fraction = ''] = text.split('.');
  const points = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (points > 10000) throw new Error('Invalid VAT rate');
  return points;
}

/** a * b / c rounded half up, for non-negative whole numbers. */
function mulDiv(a: number, b: number, c: number): number {
  return Number((BigInt(a) * BigInt(b) * 2n + BigInt(c)) / (BigInt(c) * 2n));
}

export interface TotalsInput {
  type: DocumentType;
  lines: { qty: string; unitPrice: string }[];
  /** Charge VAT at all. Off means the VAT line is 0. Proformas never have VAT. */
  vatEnabled: boolean;
  vatRate: string;
  /** True: the line prices already include VAT, and VAT is worked out of the total. */
  pricesIncludeVat: boolean;
  freight?: string;
  insurance?: string;
  otherCharges?: string;
  deposit?: string;
  /** Receipts have one amount and no lines. */
  amount?: string;
}

export interface Totals {
  lineAmounts: number[];
  /** Subtotal (VEP): before VAT. For a proforma, the sum of the lines. */
  subtotal: number;
  vat: number;
  freight: number;
  insurance: number;
  otherCharges: number;
  /** TOTAL (VIP). */
  total: number;
  deposit: number;
  /** Order forms: total less the deposit. */
  balance: number;
}

const cents = (value: string | undefined) => (value && value.trim() ? toCents(value) : 0);

/**
 * Totals for a document. Invoices and order forms: Subtotal (VEP), VAT, TOTAL (VIP),
 * and for order forms Deposit paid and BALANCE DUE. Proformas: Subtotal, Freight,
 * Insurance, Other charges, TOTAL. Receipts: the amount received.
 */
export function documentTotals(input: TotalsInput): Totals {
  const zero = {
    lineAmounts: [],
    subtotal: 0,
    vat: 0,
    freight: 0,
    insurance: 0,
    otherCharges: 0,
    total: 0,
    deposit: 0,
    balance: 0,
  };
  if (input.type === 'receipt') {
    const amount = cents(input.amount);
    return { ...zero, subtotal: amount, total: amount };
  }
  const lineAmounts = input.lines.map((line) => lineAmountCents(line.qty, line.unitPrice));
  const sum = lineAmounts.reduce((total, amount) => total + amount, 0);

  if (input.type === 'proforma') {
    const freight = cents(input.freight);
    const insurance = cents(input.insurance);
    const otherCharges = cents(input.otherCharges);
    const total = sum + freight + insurance + otherCharges;
    return { ...zero, lineAmounts, subtotal: sum, freight, insurance, otherCharges, total };
  }

  let subtotal = sum;
  let vat = 0;
  if (input.vatEnabled) {
    const points = rateToBasisPoints(input.vatRate);
    if (input.pricesIncludeVat) {
      // The lines already include VAT: take it out of the sum.
      vat = mulDiv(sum, points, 10000 + points);
      subtotal = sum - vat;
    } else {
      vat = mulDiv(sum, points, 10000);
    }
  }
  const total = subtotal + vat;
  const deposit = input.type === 'order' ? cents(input.deposit) : 0;
  return {
    ...zero,
    lineAmounts,
    subtotal,
    vat,
    total,
    deposit,
    balance: input.type === 'order' ? total - deposit : 0,
  };
}

/** The same totals as decimal strings ("12.50"), for the database and the JSON. */
export function totalsToDecimals(totals: Totals) {
  return {
    subtotal: centsToDecimal(totals.subtotal),
    vat: centsToDecimal(totals.vat),
    freight: centsToDecimal(totals.freight),
    insurance: centsToDecimal(totals.insurance),
    other_charges: centsToDecimal(totals.otherCharges),
    total: centsToDecimal(totals.total),
    deposit: centsToDecimal(totals.deposit),
    balance: centsToDecimal(totals.balance),
  };
}

const ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function underThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);
  if (rest) {
    const words =
      rest < 20
        ? ONES[rest]
        : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` ${ONES[rest % 10]}` : ''}`;
    parts.push(hundreds ? `and ${words}` : (words ?? ''));
  }
  return parts.join(' ');
}

function wholeWords(n: number): string {
  if (n === 0) return 'zero';
  const groups: [number, string][] = [
    [1_000_000_000, 'billion'],
    [1_000_000, 'million'],
    [1_000, 'thousand'],
  ];
  const parts: string[] = [];
  let rest = n;
  for (const [size, name] of groups) {
    if (rest >= size) {
      parts.push(`${underThousand(Math.floor(rest / size))} ${name}`);
      rest %= size;
    }
  }
  if (rest)
    parts.push(rest < 100 && parts.length ? `and ${underThousand(rest)}` : underThousand(rest));
  return parts.join(' ');
}

/** 12050 to "One hundred and twenty dollars and fifty cents", for the receipt's "sum of". */
export function amountInWords(amountCents: number, currency = 'FJD'): string {
  const dollars = Math.floor(amountCents / 100);
  const remainder = amountCents % 100;
  const unit = currency === 'FJD' ? 'Fiji dollar' : `${currency}`;
  let text = `${wholeWords(dollars)} ${currency === 'FJD' ? (dollars === 1 ? unit : `${unit}s`) : unit}`;
  if (remainder) text += ` and ${wholeWords(remainder)} cent${remainder === 1 ? '' : 's'}`;
  else text += ' only';
  return text.charAt(0).toUpperCase() + text.slice(1);
}
