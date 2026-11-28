import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  checkoutBody,
  productId,
  regionId,
  resetData,
  setShopSettings,
  startHarness,
  stockOf,
  variantId,
  type Harness,
} from './harness.js';

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await resetData(h.db);
  await setShopSettings(h.db);
  h.sent.length = 0;
});

const order = (body: object) => request(h.app).post('/v1/orders').send(body);

describe('cart pricing', () => {
  it('prices from the database and merges repeated lines', async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    const res = await request(h.app)
      .post('/v1/cart/price')
      .send({
        lines: [
          { productId: paper, variantId: null, quantity: 2 },
          { productId: paper, variantId: null, quantity: 1 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0]).toMatchObject({
      quantity: 3,
      unitPrice: '14.50',
      lineTotal: '43.50',
      problem: null,
    });
    expect(res.body.subtotal).toBe('43.50');
  });

  it('keeps two variants of one product as separate lines', async () => {
    const chair = await productId(h.db, 'ergonomic-mesh-office-chair');
    const black = await variantId(h.db, 'SAMPLE-009-BLK');
    const desk = await productId(h.db, 'straight-office-desk');
    const small = await variantId(h.db, 'SAMPLE-011-1200');
    const large = await variantId(h.db, 'SAMPLE-011-1500');
    const res = await request(h.app)
      .post('/v1/cart/price')
      .send({
        lines: [
          { productId: desk, variantId: small, quantity: 1 },
          { productId: desk, variantId: large, quantity: 1 },
          { productId: chair, variantId: black, quantity: 1 },
        ],
      });
    expect(res.body.lines.map((line: { unitPrice: string }) => line.unitPrice)).toEqual([
      '420.00',
      '495.00',
      '389.00',
    ]);
    expect(res.body.subtotal).toBe('1304.00');
  });

  it('flags a variable product with no option chosen instead of crashing', async () => {
    const chair = await productId(h.db, 'ergonomic-mesh-office-chair');
    const res = await request(h.app)
      .post('/v1/cart/price')
      .send({ lines: [{ productId: chair, variantId: null, quantity: 1 }] });
    expect(res.status).toBe(200);
    expect(res.body.lines[0].problem).toBe('choose_variant');
    expect(res.body.ok).toBe(false);
  });

  it('applies the sale price only while the sale is on', async () => {
    const box = await productId(h.db, 'a4-copy-paper-box-of-5-reams');
    const price = async () =>
      (
        await request(h.app)
          .post('/v1/cart/price')
          .send({ lines: [{ productId: box, variantId: null, quantity: 1 }] })
      ).body.lines[0].unitPrice;
    expect(await price()).toBe('62.00'); // sample data switches the sale on
    await h.db.query(`update public.sale_settings set active = false`);
    expect(await price()).toBe('68.00');
  });

  it('adds the delivery charge for the chosen Fiji region', async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    const labasa = await regionId(h.db, 'Labasa');
    const res = await request(h.app)
      .post('/v1/cart/price')
      .send({
        lines: [{ productId: paper, variantId: null, quantity: 1 }],
        deliveryMethod: 'shipping',
        regionId: labasa,
      });
    expect(res.body).toMatchObject({
      subtotal: '14.50',
      shipping: '45.00',
      total: '59.50',
      currency: 'FJD',
    });
  });
});

describe('cheat attempts (Appendix B section 10)', () => {
  it('refuses a price sent from the browser', async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    const res = await order(
      checkoutBody([{ productId: paper, variantId: null, quantity: 1, price: '0.01' } as never]),
    );
    expect(res.status).toBe(400);
    expect(await h.db.query('select 1 from public.orders')).toHaveLength(0);
  });

  it('refuses a total, discount or delivery cost sent from the browser', async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    for (const extra of [{ total: '0.01' }, { discount: '100' }, { shippingCost: '0' }]) {
      const res = await order(
        checkoutBody([{ productId: paper, variantId: null, quantity: 1 }], extra),
      );
      expect(res.status).toBe(400);
    }
  });

  it('charges the database price even when the expected total is lower', async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    const res = await order(
      checkoutBody([{ productId: paper, variantId: null, quantity: 1 }], { expectedTotal: '0.01' }),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('price_changed');
    expect(await h.db.query('select 1 from public.orders')).toHaveLength(0);
  });

  it.each([0, -1, 1.5, 1000])('refuses quantity %d', async (quantity) => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    const res = await order(checkoutBody([{ productId: paper, variantId: null, quantity }]));
    expect(res.status).toBe(400);
  });

  it('refuses more than the stock and changes nothing', async () => {
    const glue = await productId(h.db, 'glue-sticks-21g-pack-of-12'); // stock 3
    const res = await order(checkoutBody([{ productId: glue, variantId: null, quantity: 4 }]));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('cart_changed');
    expect(res.body.error.fields[0].message).toBe('not_enough_stock');
    expect(await stockOf(h.db, 'glue-sticks-21g-pack-of-12')).toBe(3);
  });

  it('sells the last item to only one of two buyers at the same moment', async () => {
    const glue = await productId(h.db, 'glue-sticks-21g-pack-of-12');
    await h.db.query(`update public.products set stock = 1 where id = $1`, [glue]);
    const results = await Promise.all([
      order(checkoutBody([{ productId: glue, variantId: null, quantity: 1 }])),
      order(
        checkoutBody([{ productId: glue, variantId: null, quantity: 1 }], {
          email: 'second@example.test',
        }),
      ),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(await stockOf(h.db, 'glue-sticks-21g-pack-of-12')).toBe(0);
  });

  it('refuses a product that is hidden, deleted or in a hidden category', async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    await h.db.query('update public.products set status = false where id = $1', [paper]);
    const res = await order(checkoutBody([{ productId: paper, variantId: null, quantity: 1 }]));
    expect(res.status).toBe(409);
    expect(res.body.error.fields[0].message).toBe('not_found');
  });

  it('refuses a variant id that belongs to another product', async () => {
    const chair = await productId(h.db, 'ergonomic-mesh-office-chair');
    const deskVariant = await variantId(h.db, 'SAMPLE-011-1200'); // FJ$420 desk option
    const res = await order(
      checkoutBody([{ productId: chair, variantId: deskVariant, quantity: 1 }]),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.fields[0].message).toBe('variant_not_found');
  });

  it('refuses a price-on-request item at checkout', async () => {
    const counter = await productId(h.db, 'reception-counter');
    const res = await order(checkoutBody([{ productId: counter, variantId: null, quantity: 1 }]));
    expect(res.status).toBe(409);
    expect(res.body.error.fields[0].message).toBe('quote_only');
  });

  it('refuses to sell the spotlighted "request a quote" display products (update 01)', async () => {
    const [category] = await h.db.query<{ id: number }>(
      `insert into public.categories (name, slug) values ('Displays and Screens', 'displays-and-screens') returning id`,
    );
    const [subcategory] = await h.db.query<{ id: number }>(
      `insert into public.subcategories (category_id, name, slug) values ($1, 'Interactive Displays', 'interactive-displays') returning id`,
      [category?.id],
    );
    await h.db.query(
      `insert into public.products (category_id, subcategory_id, name, slug, sku, original_price, spotlight)
       values ($1, $2, 'Interactive Smart Board', 'interactive-smart-board', 'OD-DISPLAY-01', 0, true)`,
      [category?.id, subcategory?.id],
    );
    const board = await productId(h.db, 'interactive-smart-board');
    const res = await order(checkoutBody([{ productId: board, variantId: null, quantity: 1 }]));
    expect(res.status).toBe(409);
    expect(res.body.error.fields[0].message).toBe('quote_only');
    expect(await h.db.query('select 1 from public.orders')).toHaveLength(0);
  });

  it('refuses a product that is arriving soon, even with a price and stock (update 02)', async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    await h.db.query("update public.products set availability = 'arriving_soon' where id = $1", [
      paper,
    ]);
    const res = await order(checkoutBody([{ productId: paper, variantId: null, quantity: 1 }]));
    expect(res.status).toBe(409);
    expect(res.body.error.fields[0].message).toBe('arriving_soon');
    expect(await h.db.query('select 1 from public.orders')).toHaveLength(0);
  });

  it("does not show one customer's order to someone else", async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    const placed = await order(checkoutBody([{ productId: paper, variantId: null, quantity: 1 }]));
    const reference = placed.body.reference as string;
    const wrongEmail = await request(h.app)
      .post('/v1/orders/lookup')
      .send({ reference, email: 'someone-else@example.test' });
    expect(wrongEmail.status).toBe(404);
    const guessed = await request(h.app)
      .post('/v1/orders/lookup')
      .send({ reference: '0'.repeat(32), email: 'buyer@example.test' });
    expect(guessed.status).toBe(404);
    // Same message for both, so neither the reference nor the email can be probed.
    expect(wrongEmail.body.error.message).toBe(guessed.body.error.message);
    const invoice = await request(h.app)
      .post('/v1/orders/invoice')
      .send({ reference, email: 'someone-else@example.test' });
    expect(invoice.status).toBe(404);
  });

  it('cannot read orders through the public database role', async () => {
    await expect(
      h.db.asAnon((client) => client.query('select * from public.orders')),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('bank transfer order', () => {
  it('saves the order, takes stock, emails the customer and shop only, and shows bank details', async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    const suva = await regionId(h.db, 'Suva and Lami');
    const res = await order(
      checkoutBody([{ productId: paper, variantId: null, quantity: 2 }], {
        deliveryMethod: 'shipping',
        regionId: suva,
        address: { streetName: 'Ratu Mara Road', city: 'Suva', division: 'Central' },
        expectedTotal: '39.00',
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      orderNumber: 'OD-100001',
      total: '39.00',
      paymentMethod: 'bank_transfer',
    });
    expect(res.body.reference).toMatch(/^[0-9a-f]{32}$/);
    expect(await stockOf(h.db, 'a4-copy-paper-80gsm-500-sheets')).toBe(118);

    expect(h.sent.map((email) => email.to).sort()).toEqual([
      'buyer@example.test',
      'shop@example.test',
    ]);
    for (const email of h.sent) {
      expect(email.attachments?.[0]?.filename).toBe('invoice-OD-100001.pdf');
      expect(email.attachments?.[0]?.content.subarray(0, 5).toString()).toBe('%PDF-');
    }
    const customerEmail = h.sent.find((email) => email.to === 'buyer@example.test');
    expect(customerEmail?.text).toContain('987654321');
    expect(customerEmail?.text).toContain('Payment reference: OD-100001');

    const lookup = await request(h.app)
      .post('/v1/orders/lookup')
      .send({ reference: res.body.reference, email: 'BUYER@example.test' });
    expect(lookup.status).toBe(200);
    expect(lookup.body).toMatchObject({
      orderNumber: 'OD-100001',
      paymentState: 'awaiting',
      address: 'Ratu Mara Road, Suva, Central, Fiji',
    });
    expect(lookup.body.bankDetails.accountNumber).toBe('987654321');

    const invoice = await request(h.app)
      .post('/v1/orders/invoice')
      .send({ reference: res.body.reference, email: 'buyer@example.test' });
    expect(invoice.status).toBe(200);
    expect(invoice.headers['content-type']).toBe('application/pdf');
  });

  it('asks the customer to contact the shop when no bank details are set', async () => {
    await setShopSettings(h.db, { bank: false });
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    const res = await order(checkoutBody([{ productId: paper, variantId: null, quantity: 1 }]));
    expect(res.status).toBe(201);
    const customerEmail = h.sent.find((email) => email.to === 'buyer@example.test');
    expect(customerEmail?.text).toContain('contact us for our bank details');
    expect(customerEmail?.text).not.toContain('Account number');
    const lookup = await request(h.app)
      .post('/v1/orders/lookup')
      .send({ reference: res.body.reference, email: 'buyer@example.test' });
    expect(lookup.body.bankDetails).toBeNull();
  });

  it('returns the same order when the same checkout is sent twice', async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    const body = checkoutBody([{ productId: paper, variantId: null, quantity: 1 }]);
    const [first, second] = await Promise.all([order(body), order(body)]);
    expect(first.body.reference).toBe(second.body.reference);
    expect(await h.db.query('select 1 from public.orders')).toHaveLength(1);
    expect(await stockOf(h.db, 'a4-copy-paper-80gsm-500-sheets')).toBe(119);
  });

  it('takes stock from the chosen variant only', async () => {
    const desk = await productId(h.db, 'straight-office-desk');
    const small = await variantId(h.db, 'SAMPLE-011-1200');
    const res = await order(checkoutBody([{ productId: desk, variantId: small, quantity: 2 }]));
    expect(res.status).toBe(201);
    const stock = await h.db.query<{ sku: string; stock: number }>(
      `select sku, stock from public.product_variants where product_id = $1 order by sku`,
      [desk],
    );
    expect(stock).toEqual([
      { sku: 'SAMPLE-011-1200', stock: 3 },
      { sku: 'SAMPLE-011-1500', stock: 3 },
    ]);
  });

  it('needs a region and address for delivery', async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    const res = await order(
      checkoutBody([{ productId: paper, variantId: null, quantity: 1 }], {
        deliveryMethod: 'shipping',
      }),
    );
    expect(res.status).toBe(400);
    const paths = res.body.error.fields.map((field: { path: string }) => field.path);
    expect(paths).toEqual(expect.arrayContaining(['regionId', 'address']));
  });

  it('rejects a phone number with letters and a name with a line break', async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    const res = await order(
      checkoutBody([{ productId: paper, variantId: null, quantity: 1 }], {
        phone: 'call me',
        firstName: 'Mere\nBcc: x@y.z',
      }),
    );
    expect(res.status).toBe(400);
    const paths = res.body.error.fields.map((field: { path: string }) => field.path);
    expect(paths).toEqual(expect.arrayContaining(['phone', 'firstName']));
  });
});
