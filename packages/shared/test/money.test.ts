import { describe, expect, it } from 'vitest';
import { centsToDecimal, convertCents, formatPrice, toCents } from '../src/money.js';

describe('money', () => {
  it.each([
    ['12.50', 1250],
    ['12.5', 1250],
    ['0', 0],
    ['0.01', 1],
    ['9999999999.99', 999999999999],
  ])('reads %s as %d cents', (text, cents) => {
    expect(toCents(text)).toBe(cents);
  });

  it.each(['-1', '1.234', 'abc', '', '1e3', '0x10'])('rejects %j', (text) => {
    expect(() => toCents(text)).toThrow();
  });

  it('writes cents back as a two decimal string', () => {
    expect(centsToDecimal(1250)).toBe('12.50');
    expect(centsToDecimal(5)).toBe('0.05');
    expect(centsToDecimal(0)).toBe('0.00');
  });

  it('adds up exactly where floating point would not', () => {
    expect(centsToDecimal(toCents('0.1') + toCents('0.2'))).toBe('0.30');
  });

  it('formats Fijian dollars with thousands separators', () => {
    expect(formatPrice(123456)).toBe('FJ$1,234.56');
    expect(formatPrice(950)).toBe('FJ$9.50');
    expect(formatPrice(1000, 'NZD')).toBe('NZD 10.00');
  });

  it('converts at an exchange rate, rounding half up', () => {
    expect(convertCents(10000, '0.440000')).toBe(4400);
    expect(convertCents(1, '0.5')).toBe(1);
    expect(convertCents(12345, '0.123456')).toBe(1524);
    expect(() => convertCents(100, '-1')).toThrow();
  });
});
