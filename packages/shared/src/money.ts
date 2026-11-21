// Money is handled as whole cents (integers) everywhere in code, never as
// floating point numbers, so 0.1 + 0.2 problems cannot creep into totals.
// The database stores numeric(12,2) and returns it as a string such as "12.50".

const DECIMAL = /^\d{1,10}(\.\d{1,2})?$/;

/** "12.5" or "12.50" to 1250. Rejects negatives, letters and more than two decimals. */
export function toCents(value: string): number {
  const text = value.trim();
  if (!DECIMAL.test(text)) throw new Error(`Not a money amount: ${JSON.stringify(value)}`);
  const [whole = '0', fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** 1250 to "12.50", the form the database and PayPal expect. */
export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error('Cents must be a whole number');
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** 1250 to "FJ$12.50", 123456 to "FJ$1,234.56". */
export function formatPrice(cents: number, currency = 'FJD'): string {
  const [whole = '0', fraction = '00'] = centsToDecimal(Math.abs(cents)).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = cents < 0 ? '-' : '';
  const prefix = currency === 'FJD' ? 'FJ$' : `${currency} `;
  return `${sign}${prefix}${grouped}.${fraction}`;
}

const RATE = /^\d{1,6}(\.\d{1,6})?$/;

/**
 * Converts an amount at an exchange rate such as "0.440000" (units of the other
 * currency per 1 FJD), rounding half up to the nearest cent. Uses BigInt so no
 * precision is lost.
 */
export function convertCents(cents: number, rate: string): number {
  if (!RATE.test(rate.trim())) throw new Error('Invalid exchange rate');
  const [whole = '0', fraction = ''] = rate.trim().split('.');
  const micro = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  const scaled = BigInt(cents) * micro;
  return Number((scaled + 500_000n) / 1_000_000n);
}
