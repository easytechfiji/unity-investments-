import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { productId, resetData, setShopSettings, startHarness, type Harness } from './harness.js';

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

describe('catalogue', () => {
  it('lists published products with filters, sorting and pages', async () => {
    const all = await request(h.app).get('/v1/products?pageSize=48');
    expect(all.body.total).toBe(23);
    const byPrice = await request(h.app).get(
      '/v1/products?category=office-stationery&sort=price_asc',
    );
    const prices = byPrice.body.products.map((product: { price: string }) => Number(product.price));
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    const filtered = await request(h.app).get('/v1/products?min=20&max=40&inStock=1');
    for (const product of filtered.body.products) {
      expect(Number(product.price)).toBeGreaterThanOrEqual(20);
      expect(Number(product.price)).toBeLessThanOrEqual(40);
      expect(product.stock).toBeGreaterThan(0);
    }
    const paged = await request(h.app).get('/v1/products?pageSize=10&page=3');
    expect(paged.body).toMatchObject({ page: 3, totalPages: 3, total: 23 });
    expect(paged.body.products).toHaveLength(3);
  });

  it('defaults to the Recommended order: spotlighted, then trending, then rank, then name', async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets'); // trending in sample data
    await h.db.query(`update public.products set spotlight = true, sort_rank = 1 where id = $1`, [
      paper,
    ]);
    const res = await request(h.app).get('/v1/products?pageSize=48');
    expect(res.body.products[0].slug).toBe('a4-copy-paper-80gsm-500-sheets');
    // Recommended is also the default: no sort parameter gives the same order.
    const withSort = await request(h.app).get('/v1/products?pageSize=48&sort=recommended');
    expect(withSort.body.products.map((p: { slug: string }) => p.slug)).toEqual(
      res.body.products.map((p: { slug: string }) => p.slug),
    );
  });

  it('hides the count of a product arriving soon and lists it after products in stock (update 02)', async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    await h.db.query(
      `update public.products set availability = 'arriving_soon', spotlight = true, sort_rank = 1 where id = $1`,
      [paper],
    );
    const detail = await request(h.app).get('/v1/products/a4-copy-paper-80gsm-500-sheets');
    expect(detail.body.availability).toBe('arriving_soon');
    expect(detail.body.stock).toBe(0);
    const list = await request(h.app).get('/v1/products?pageSize=48');
    const slugs = list.body.products.map((p: { slug: string }) => p.slug);
    // Spotlighted and ranked first, but still after every product that is in stock.
    expect(slugs.at(-1)).toBe('a4-copy-paper-80gsm-500-sheets');
    const inStockOnly = await request(h.app).get('/v1/products?pageSize=48&inStock=true');
    expect(inStockOnly.body.products.map((p: { slug: string }) => p.slug)).not.toContain(
      'a4-copy-paper-80gsm-500-sheets',
    );
  });

  it('page 2 continues exactly where page 1 stopped, for every sort', async () => {
    for (const sort of [
      'recommended',
      'price_asc',
      'price_desc',
      'name_asc',
      'name_desc',
      'newest',
    ]) {
      const [page1, page2] = await Promise.all([
        request(h.app).get(`/v1/products?pageSize=10&page=1&sort=${sort}`),
        request(h.app).get(`/v1/products?pageSize=10&page=2&sort=${sort}`),
      ]);
      const slugs1 = page1.body.products.map((p: { slug: string }) => p.slug);
      const slugs2 = page2.body.products.map((p: { slug: string }) => p.slug);
      expect(new Set([...slugs1, ...slugs2]).size).toBe(slugs1.length + slugs2.length);
    }
  });

  it('serves the spotlighted products for the home page display section', async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    const pens = await productId(h.db, 'ballpoint-pens-blue-box-of-50');
    await h.db.query(`update public.products set spotlight = true, sort_rank = 2 where id = $1`, [
      pens,
    ]);
    await h.db.query(`update public.products set spotlight = true, sort_rank = 1 where id = $1`, [
      paper,
    ]);
    const res = await request(h.app).get('/v1/spotlight');
    expect(res.body.map((p: { slug: string }) => p.slug)).toEqual([
      'a4-copy-paper-80gsm-500-sheets',
      'ballpoint-pens-blue-box-of-50',
    ]);
    expect(res.body.every((p: { video: unknown }) => p.video === null)).toBe(true);
  });

  it('searches names and SKUs, and treats % as a character', async () => {
    const res = await request(h.app).get('/v1/products?q=copy%20paper');
    expect(res.body.products.map((product: { slug: string }) => product.slug).sort()).toEqual([
      'a4-copy-paper-80gsm-500-sheets',
      'a4-copy-paper-box-of-5-reams',
    ]);
    expect((await request(h.app).get('/v1/products?q=SAMPLE-018')).body.products[0].slug).toBe(
      'traffic-cone-700mm',
    );
    expect((await request(h.app).get('/v1/products?q=%25')).body.total).toBe(0);
  });

  it('rejects unknown query fields and bad slugs with a clean 400', async () => {
    expect((await request(h.app).get('/v1/products?sort=drop%20table')).status).toBe(400);
    expect((await request(h.app).get('/v1/products?evil=1')).status).toBe(400);
    expect((await request(h.app).get('/v1/products/Not%20A%20Slug')).status).toBe(400);
  });

  it('gives a real 404 for hidden and unknown items', async () => {
    await h.db.query(`update public.products set status = false where slug = 'whiteboard-eraser'`);
    expect((await request(h.app).get('/v1/products/whiteboard-eraser')).status).toBe(404);
    expect((await request(h.app).get('/v1/categories/no-such-thing')).status).toBe(404);
  });

  it('never exposes bank details in public settings', async () => {
    const site = await request(h.app).get('/v1/site');
    expect(JSON.stringify(site.body)).not.toContain('987654321');
    expect(site.body.currency).toBe('FJD');
  });

  it('lists every public page address for the sitemap', async () => {
    const sitemap = await request(h.app).get('/v1/sitemap');
    const paths = sitemap.body.map((entry: { path: string }) => entry.path);
    expect(paths).toContain('/collection/road-safety');
    expect(paths).toContain(
      '/collection/road-safety/safety-tape/product/barrier-tape-red-white-100m',
    );
  });

  it('looks up redirects set in the admin', async () => {
    await h.db.query(
      `insert into public.redirects (from_path, to_path) values ('/collection/old-chairs', '/collection/office-furniture')`,
    );
    const res = await request(h.app).get('/v1/redirects?path=/collection/old-chairs');
    expect(res.body.to).toBe('/collection/office-furniture');
  });
});

describe('contact and quote forms', () => {
  it('emails the shop in plain text with the visitor as reply to', async () => {
    const res = await request(h.app).post('/v1/forms/contact').send({
      name: 'Ana',
      email: 'ana@example.test',
      message: '<b>Hello</b> do you deliver to Nadi?',
      subject: 'Delivery',
    });
    expect(res.status).toBe(200);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({
      to: 'shop@example.test',
      replyTo: 'ana@example.test',
      subject: 'Website enquiry: Delivery',
    });
    expect(h.sent[0]?.html).toBeUndefined();
    expect(h.sent[0]?.text).toContain('<b>Hello</b>');
  });

  it('drops bot submissions caught by the honeypot without saying so', async () => {
    const res = await request(h.app).post('/v1/forms/contact').send({
      name: 'Bot',
      email: 'bot@example.test',
      message: 'spam',
      website: 'http://spam.example',
    });
    expect(res.status).toBe(200);
    expect(h.sent).toHaveLength(0);
  });

  it('refuses line breaks in the name or subject (email header injection)', async () => {
    const res = await request(h.app).post('/v1/forms/contact').send({
      name: 'Ana\r\nBcc: victim@example.test',
      email: 'ana@example.test',
      message: 'hi',
      subject: 'Hi\nBcc: x@y.z',
    });
    expect(res.status).toBe(400);
    expect(h.sent).toHaveLength(0);
  });

  it('names the product in a quote request', async () => {
    const [counter] = await h.db.query<{ id: number }>(
      `select id from public.products where slug = 'reception-counter'`,
    );
    const res = await request(h.app).post('/v1/forms/quote').send({
      name: 'Ana',
      email: 'ana@example.test',
      message: 'Need one 2 m long',
      productId: counter?.id,
      quantity: 1,
    });
    expect(res.status).toBe(200);
    expect(h.sent[0]?.subject).toBe('Quote request: Reception counter');
    expect(h.sent[0]?.text).toContain('SKU SAMPLE-012');
  });
});

describe('real rate limits', () => {
  it('stops a sixth contact message within ten minutes', async () => {
    const strict = await startHarness({ RATE_LIMIT_SCALE: '1' });
    try {
      await setShopSettings(strict.db);
      const send = () =>
        request(strict.app)
          .post('/v1/forms/contact')
          .send({ name: 'Ana', email: 'ana@example.test', message: 'hi' });
      for (let i = 0; i < 5; i += 1) expect((await send()).status).toBe(200);
      const blocked = await send();
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('rate_limited');
    } finally {
      await strict.close();
    }
  });
});
