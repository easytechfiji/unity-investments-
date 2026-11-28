import { describe, expect, it } from 'vitest';
import {
  amountInWords,
  documentNumber,
  documentTotals,
  lineAmountCents,
  rateToBasisPoints,
} from '../src/documents.js';
import { adminDocumentSchema } from '../src/adminSchemas.js';

describe('document numbers', () => {
  it.each([
    ['invoice', 1, 'INV-0001'],
    ['receipt', 61, 'RCT-0061'],
    ['proforma', 9999, 'PRO-9999'],
    ['order', 12345, 'ORD-12345'],
  ] as const)('%s %i is %s', (type, number, expected) => {
    expect(documentNumber(type, number)).toBe(expected);
  });
});

describe('document totals', () => {
  it('multiplies quantity by price, rounding half up to the cent', () => {
    expect(lineAmountCents('3', '12.50')).toBe(3750);
    expect(lineAmountCents('1.5', '0.33')).toBe(50); // 0.495 rounds up to 0.50
    expect(lineAmountCents('0.001', '1.00')).toBe(0);
  });

  it('takes VAT out of prices that include it', () => {
    // FJD 112.50 including VAT at 12.5%: 100.00 before VAT, 12.50 VAT.
    const totals = documentTotals({
      type: 'invoice',
      lines: [{ qty: '1', unitPrice: '112.50' }],
      vatEnabled: true,
      vatRate: '12.5',
      pricesIncludeVat: true,
    });
    expect(totals).toMatchObject({ subtotal: 10000, vat: 1250, total: 11250 });
  });

  it('adds VAT to prices that do not include it', () => {
    const totals = documentTotals({
      type: 'invoice',
      lines: [
        { qty: '2', unitPrice: '40.00' },
        { qty: '1', unitPrice: '20.00' },
      ],
      vatEnabled: true,
      vatRate: '12.5',
      pricesIncludeVat: false,
    });
    expect(totals).toMatchObject({
      lineAmounts: [8000, 2000],
      subtotal: 10000,
      vat: 1250,
      total: 11250,
    });
  });

  it('has no VAT when VAT is switched off', () => {
    const totals = documentTotals({
      type: 'invoice',
      lines: [{ qty: '1', unitPrice: '50.00' }],
      vatEnabled: false,
      vatRate: '12.5',
      pricesIncludeVat: true,
    });
    expect(totals).toMatchObject({ subtotal: 5000, vat: 0, total: 5000 });
  });

  it('subtotal and VAT always add up to the total exactly', () => {
    for (const price of ['0.01', '0.99', '1.13', '33.33', '99.99', '1234.57']) {
      for (const includes of [true, false]) {
        const t = documentTotals({
          type: 'invoice',
          lines: [{ qty: '3', unitPrice: price }],
          vatEnabled: true,
          vatRate: '12.5',
          pricesIncludeVat: includes,
        });
        expect(t.subtotal + t.vat).toBe(t.total);
      }
    }
  });

  it('works out the balance on an order form', () => {
    const totals = documentTotals({
      type: 'order',
      lines: [{ qty: '2', unitPrice: '60.00' }],
      vatEnabled: true,
      vatRate: '12.5',
      pricesIncludeVat: true,
      deposit: '50.00',
    });
    expect(totals).toMatchObject({ total: 12000, deposit: 5000, balance: 7000 });
  });

  it('adds freight, insurance and other charges on a proforma, without VAT', () => {
    const totals = documentTotals({
      type: 'proforma',
      lines: [{ qty: '100', unitPrice: '5.00' }],
      vatEnabled: true,
      vatRate: '12.5',
      pricesIncludeVat: true,
      freight: '120.00',
      insurance: '15.50',
      otherCharges: '4.50',
    });
    expect(totals).toMatchObject({ subtotal: 50000, vat: 0, total: 64000 });
  });

  it('uses the amount on a receipt', () => {
    const totals = documentTotals({
      type: 'receipt',
      lines: [],
      vatEnabled: false,
      vatRate: '0',
      pricesIncludeVat: true,
      amount: '75.00',
    });
    expect(totals.total).toBe(7500);
  });

  it('refuses a VAT rate over 100 or with too many decimals', () => {
    expect(() => rateToBasisPoints('101')).toThrow();
    expect(() => rateToBasisPoints('12.555')).toThrow();
    expect(rateToBasisPoints('12.5')).toBe(1250);
  });
});

describe('amount in words', () => {
  it.each([
    [100, 'One Fiji dollar only'],
    [12050, 'One hundred and twenty Fiji dollars and fifty cents'],
    [100001, 'One thousand Fiji dollars and one cent'],
    [
      123456789,
      'One million two hundred and thirty four thousand five hundred and sixty seven Fiji dollars and eighty nine cents',
    ],
    [10500, 'One hundred and five Fiji dollars only'],
    [0, 'Zero Fiji dollars only'],
  ])('%i cents', (cents, words) => {
    expect(amountInWords(cents)).toBe(words);
  });
});

describe('document input', () => {
  const party = { name: 'Mere Tester' };
  it('needs at least one line, except on a receipt', () => {
    const invoice = adminDocumentSchema.safeParse({
      type: 'invoice',
      party,
      issue_date: '2026-11-29',
    });
    expect(invoice.success).toBe(false);
    const receipt = adminDocumentSchema.safeParse({
      type: 'receipt',
      party,
      issue_date: '2026-11-29',
      amount: '20.00',
      fields: { paid_by: 'Cash', being_payment_for: 'Two bedsheets' },
    });
    expect(receipt.success).toBe(true);
  });

  it('only lets a proforma use another currency', () => {
    const result = adminDocumentSchema.safeParse({
      type: 'invoice',
      party,
      issue_date: '2026-11-29',
      currency: 'USD',
      lines: [{ description: 'Sheet', qty: '1', unit_price: '40.00' }],
    });
    expect(result.success).toBe(false);
  });

  it('refuses fields it does not know (no total sent from the browser)', () => {
    const result = adminDocumentSchema.safeParse({
      type: 'invoice',
      party,
      issue_date: '2026-11-29',
      lines: [{ description: 'Sheet', qty: '1', unit_price: '40.00' }],
      total: '1.00',
    });
    expect(result.success).toBe(false);
  });
});
