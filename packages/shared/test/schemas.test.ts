import { describe, expect, it } from 'vitest';
import { adminProductSchema } from '../src/adminSchemas.js';
import { cartLineSchema, quoteFormSchema, slugSchema } from '../src/schemas.js';

describe('slugSchema', () => {
  it.each(['office-chairs', 'a4-paper', 'pens'])('accepts %s', (slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(true);
  });

  it.each(['Office-Chairs', 'office--chairs', '-pens', 'pens-', 'pens chairs', ''])(
    'rejects %j',
    (slug) => {
      expect(slugSchema.safeParse(slug).success).toBe(false);
    },
  );
});

describe('cartLineSchema', () => {
  it('accepts a simple product line', () => {
    expect(cartLineSchema.parse({ productId: 5, variantId: null, quantity: 2 })).toEqual({
      productId: 5,
      variantId: null,
      quantity: 2,
    });
  });

  it('rejects a price sent from the browser', () => {
    const result = cartLineSchema.safeParse({
      productId: 5,
      variantId: null,
      quantity: 1,
      price: 0.01,
    });
    expect(result.success).toBe(false);
  });

  it.each([0, -1, 1.5, 1000])('rejects quantity %d', (quantity) => {
    expect(cartLineSchema.safeParse({ productId: 5, variantId: null, quantity }).success).toBe(
      false,
    );
  });
});

describe('adminProductSchema', () => {
  const base = {
    category_id: 1,
    subcategory_id: 1,
    name: 'Interactive board',
    slug: 'interactive-board',
    original_price: '0.00',
  };

  it('defaults spotlight to off and sort_rank to 1000', () => {
    const result = adminProductSchema.parse(base);
    expect(result.spotlight).toBe(false);
    expect(result.sort_rank).toBe(1000);
    expect(result.quote_size_options).toBeNull();
  });

  it('splits a comma separated size list and trims each one', () => {
    const result = adminProductSchema.parse({
      ...base,
      spotlight: true,
      sort_rank: 1,
      quote_size_options: '55 inch, 65 inch ,  75 inch',
    });
    expect(result.spotlight).toBe(true);
    expect(result.sort_rank).toBe(1);
    expect(result.quote_size_options).toEqual(['55 inch', '65 inch', '75 inch']);
  });

  it('stores an empty size list as null', () => {
    expect(
      adminProductSchema.parse({ ...base, quote_size_options: '' }).quote_size_options,
    ).toBeNull();
  });
});

describe('quoteFormSchema', () => {
  const base = { name: 'Ana', email: 'ana@example.test', message: 'How much for one?' };

  it('accepts an optional size', () => {
    expect(quoteFormSchema.parse({ ...base, size: '75 inch' }).size).toBe('75 inch');
  });

  it('leaves size out when not sent', () => {
    expect(quoteFormSchema.parse(base).size).toBeUndefined();
  });
});
