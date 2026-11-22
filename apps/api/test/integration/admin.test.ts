import ExcelJS from 'exceljs';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { totpCode } from '../../dev/fakeAuth.js';
import {
  ADMIN_ORIGIN,
  checkoutBody,
  productId,
  resetData,
  setShopSettings,
  signInAdmin,
  startHarness,
  stockOf,
  type AdminClient,
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

describe('admin access', () => {
  it.each([
    ['GET', '/v1/admin/dashboard'],
    ['GET', '/v1/admin/orders'],
    ['GET', '/v1/admin/products'],
    ['GET', '/v1/admin/settings'],
    ['GET', '/v1/admin/categories'],
    ['POST', '/v1/admin/products'],
    ['DELETE', '/v1/admin/orders/1'],
  ])('refuses %s %s with no login', async (method, path) => {
    const verb = method.toLowerCase() as 'get' | 'post' | 'delete';
    const client = request(h.app);
    const res = await client[verb](path).set('Origin', ADMIN_ORIGIN).set('X-Confirm-Delete', 'yes');
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('Mere');
  });

  it('refuses a forged token', async () => {
    // An unsigned token that claims two-factor. Built here so no token text sits in the file.
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const forged = `${part({ alg: 'none' })}.${part({ sub: 'x', aal: 'aal2', aud: 'authenticated' })}.`;
    const res = await request(h.app).get('/v1/admin/orders').set('Cookie', `od_admin=${forged}`);
    expect(res.status).toBe(401);
  });

  it('refuses changes from another website (cross site request forgery)', async () => {
    const admin = await signInAdmin(h);
    const res = await admin.post('/products', {}).set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('bad_origin');
  });

  it('needs the authenticator code, not just the password', async () => {
    const user = h.auth.createUser('half@example.test', 'correct horse battery staple');
    h.auth.addVerifiedFactor('half@example.test');
    await h.db.query('insert into auth.users (id, email) values ($1, $2)', [
      user.id,
      'half@example.test',
    ]);
    await h.db.query(
      `insert into public.admin_profiles (user_id, name, role) values ($1, 'Half', 'owner')`,
      [user.id],
    );
    const agent = request.agent(h.app);
    const login = await agent
      .post('/v1/admin/auth/login')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: 'half@example.test', password: 'correct horse battery staple' });
    expect(login.body).toEqual({ next: 'mfa_verify' });
    const cookies = String(login.headers['set-cookie']);
    expect(cookies).toMatch(/HttpOnly/);
    expect(cookies).toMatch(/SameSite=Strict/);
    const blocked = await agent.get('/v1/admin/orders');
    expect(blocked.status).toBe(401);
    expect(blocked.body.error.code).toBe('mfa_required');
    // With only a password, nobody can add their own authenticator to the account.
    const enrol = await agent.post('/v1/admin/auth/mfa/enroll').set('Origin', ADMIN_ORIGIN);
    expect(enrol.status).toBe(409);
    const wrong = await agent
      .post('/v1/admin/auth/mfa/verify')
      .set('Origin', ADMIN_ORIGIN)
      .send({ code: '000000' });
    expect(wrong.status).toBe(401);
  });

  it('sets up an authenticator on first sign in', async () => {
    const user = h.auth.createUser('new@example.test', 'correct horse battery staple');
    await h.db.query('insert into auth.users (id, email) values ($1, $2)', [
      user.id,
      'new@example.test',
    ]);
    await h.db.query(
      `insert into public.admin_profiles (user_id, name, role) values ($1, 'New', 'staff')`,
      [user.id],
    );
    const agent = request.agent(h.app);
    const login = await agent
      .post('/v1/admin/auth/login')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: 'new@example.test', password: 'correct horse battery staple' });
    expect(login.body).toEqual({ next: 'mfa_enroll' });
    const first = await agent.post('/v1/admin/auth/mfa/enroll').set('Origin', ADMIN_ORIGIN);
    expect(first.status).toBe(200);
    // The QR code must be an image address the <img> tag can show.
    expect(first.body.qrCode).toMatch(/^data:image\/svg\+xml;base64,/);
    // Starting setup again before finishing (for example after signing in twice) must still work.
    const enrol = await agent.post('/v1/admin/auth/mfa/enroll').set('Origin', ADMIN_ORIGIN);
    expect(enrol.status).toBe(200);
    expect(enrol.body.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(enrol.body.secret).not.toBe(first.body.secret);
    const verify = await agent
      .post('/v1/admin/auth/mfa/verify')
      .set('Origin', ADMIN_ORIGIN)
      .send({ code: totpCode(enrol.body.secret) });
    expect(verify.status).toBe(200);
    const me = await agent.get('/v1/admin/auth/me');
    expect(me.body).toMatchObject({ name: 'New', role: 'staff' });
  });

  it('refuses a signed in user who is not an admin', async () => {
    h.auth.createUser('customer@example.test', 'correct horse battery staple');
    const res = await request(h.app)
      .post('/v1/admin/auth/login')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: 'customer@example.test', password: 'correct horse battery staple' });
    expect(res.status).toBe(403);
  });

  it('slows down repeated wrong passwords for one account', async () => {
    h.auth.createUser('target@example.test', 'correct horse battery staple');
    let last;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      last = await request(h.app)
        .post('/v1/admin/auth/login')
        .set('Origin', ADMIN_ORIGIN)
        .send({ email: 'target@example.test', password: 'wrong' });
    }
    expect(last?.status).toBe(429);
    const evenRight = await request(h.app)
      .post('/v1/admin/auth/login')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: 'target@example.test', password: 'correct horse battery staple' });
    expect(evenRight.status).toBe(429);
  });

  it('keeps bank details and settings for the owner only', async () => {
    const staff = await signInAdmin(h, 'staff');
    expect((await staff.get('/settings')).status).toBe(403);
    expect((await staff.get('/orders')).status).toBe(200);
    const owner = await signInAdmin(h, 'owner');
    expect((await owner.get('/settings')).body.bank_account_number).toBe('987654321');
  });
});

describe('admin catalogue', () => {
  let admin: AdminClient;
  beforeEach(async () => {
    admin = await signInAdmin(h);
  });

  async function ids() {
    const [row] = await h.db.query<{ category_id: number; subcategory_id: number }>(
      `select c.id as category_id, s.id as subcategory_id from public.categories c join public.subcategories s on s.category_id = c.id where s.slug = 'paper-and-notebooks'`,
    );
    return row ?? { category_id: 0, subcategory_id: 0 };
  }

  it('adds a product with variants and it appears on the storefront', async () => {
    const { category_id, subcategory_id } = await ids();
    const created = await admin.post('/products', {
      category_id,
      subcategory_id,
      type: 'variable',
      name: 'Lever arch file, coloured',
      slug: 'lever-arch-file-coloured',
      sku: 'TEST-LAF',
      original_price: '0',
      description: '<p>Strong board.</p><script>alert(1)</script>',
      status: true,
    });
    expect(created.status).toBe(201);
    const id = created.body.id as number;
    const values = await h.db.query<{ id: number; name: string }>(
      `select v.id, v.name from public.attribute_values v join public.attribute_options o on o.id = v.attribute_id where o.code = 'colour' order by v.name`,
    );
    const black = values.find((value) => value.name === 'Black')?.id;
    const grey = values.find((value) => value.name === 'Grey')?.id;
    const variants = await admin.put(`/products/${id}/variants`, {
      variants: [
        { sku: 'TEST-LAF-BLK', color_id: black, price: '7.90', stock: 5 },
        { sku: 'TEST-LAF-GRY', color_id: grey, price: '8.20', stock: 0 },
      ],
    });
    expect(variants.status).toBe(200);

    const page = await request(h.app).get('/v1/products/lever-arch-file-coloured');
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ price: '7.90', priceMax: '8.20', stock: 5 });
    expect(page.body.description).toBe('<p>Strong board.</p>');
    expect(page.body.variants.map((variant: { colour: string }) => variant.colour)).toEqual([
      'Black',
      'Grey',
    ]);

    const log = await h.db.query<{ action: string }>(
      `select action from public.admin_audit_log where entity = 'products' order by id`,
    );
    expect(log.map((entry) => entry.action)).toEqual(['create', 'update_variants']);
  });

  it('refuses a size used as a colour', async () => {
    const paper = await productId(h.db, 'ergonomic-mesh-office-chair');
    const [size] = await h.db.query<{ id: number }>(
      `select v.id from public.attribute_values v join public.attribute_options o on o.id = v.attribute_id where o.code = 'size' limit 1`,
    );
    const res = await admin.put(`/products/${paper}/variants`, {
      variants: [{ sku: 'X', color_id: size?.id, price: '1.00', stock: 1 }],
    });
    expect(res.status).toBe(400);
  });

  it('needs a confirm step to delete, and deleting is a soft delete that can be restored', async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    const unconfirmed = await admin.delete(`/products/${paper}`, false);
    expect(unconfirmed.status).toBe(428);
    expect((await admin.delete(`/products/${paper}`)).status).toBe(200);
    expect((await request(h.app).get('/v1/products/a4-copy-paper-80gsm-500-sheets')).status).toBe(
      404,
    );
    const [row] = await h.db.query<{ deleted_at: Date | null }>(
      'select deleted_at from public.products where id = $1',
      [paper],
    );
    expect(row?.deleted_at).not.toBeNull();
    expect((await admin.post(`/products/${paper}/restore`)).status).toBe(200);
    expect((await request(h.app).get('/v1/products/a4-copy-paper-80gsm-500-sheets')).status).toBe(
      200,
    );
  });

  it('reports a duplicate slug in plain words', async () => {
    const { category_id, subcategory_id } = await ids();
    const res = await admin.post('/products', {
      category_id,
      subcategory_id,
      name: 'Copy',
      slug: 'a4-copy-paper-80gsm-500-sheets',
      original_price: '1.00',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('That web address (slug) is already used.');
  });

  it('manages simple resources such as delivery regions', async () => {
    const created = await admin.post('/shipping-regions', {
      region_name: 'Rakiraki',
      price: '38.50',
      status: true,
      sort_order: 11,
    });
    expect(created.status).toBe(201);
    const regions = await request(h.app).get('/v1/regions');
    expect(regions.body.map((region: { name: string }) => region.name)).toContain('Rakiraki');
    const bad = await admin.post('/shipping-regions', { region_name: 'Nowhere', price: '-5' });
    expect(bad.status).toBe(400);
  });

  it('re-encodes uploaded photos and refuses files that are not images', async () => {
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    const png = await sharp({
      create: { width: 900, height: 900, channels: 3, background: '#cc0000' },
    })
      .png()
      .toBuffer();
    const ok = await admin.upload(`/products/${paper}/images`, 'files', png, 'photo.png');
    expect(ok.status).toBe(200);
    const product = await request(h.app).get('/v1/products/a4-copy-paper-80gsm-500-sheets');
    expect(product.body.image.srcSet).toMatch(
      /-400\.webp 400w, .*-800\.webp 800w, .*-1600\.webp 1600w/,
    );
    const image = await request(h.app).get(new URL(product.body.image.src).pathname);
    expect(image.status).toBe(200);
    expect(image.body.subarray(8, 12).toString()).toBe('WEBP');

    const fake = await admin.upload(
      `/products/${paper}/images`,
      'files',
      Buffer.from('<?php system($_GET["c"]); ?>'),
      'shell.png',
    );
    expect(fake.status).toBe(415);
  });

  it('imports Excel rows all or nothing, with a clear error list', async () => {
    const book = async (rows: (string | number)[][]) => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Products');
      sheet.addRow([
        'name',
        'slug',
        'sku',
        'category_slug',
        'subcategory_slug',
        'original_price',
        'selling_price',
        'qty',
        'status',
      ]);
      for (const row of rows) sheet.addRow(row);
      return Buffer.from(await workbook.xlsx.writeBuffer());
    };
    const bad = await admin.upload(
      '/products/import',
      'file',
      await book([
        [
          'Good row',
          'imported-good',
          'IMP-1',
          'office-stationery',
          'paper-and-notebooks',
          '5.00',
          '',
          10,
          1,
        ],
        [
          'Bad price',
          'imported-bad',
          'IMP-2',
          'office-stationery',
          'paper-and-notebooks',
          'abc',
          '',
          1,
          1,
        ],
        [
          'Bad category',
          'imported-cat',
          'IMP-3',
          'no-such-category',
          'paper-and-notebooks',
          '5.00',
          '',
          1,
          1,
        ],
      ]),
      'products.xlsx',
    );
    expect(bad.body.saved).toBe(false);
    expect(
      bad.body.errors.map((error: { row: number; field: string }) => `${error.row}:${error.field}`),
    ).toEqual(['3:original_price', '4:category_slug']);
    expect((await request(h.app).get('/v1/products/imported-good')).status).toBe(404);

    const good = await admin.upload(
      '/products/import',
      'file',
      await book([
        [
          'Imported paper',
          'imported-good',
          'IMP-1',
          'office-stationery',
          'paper-and-notebooks',
          '5.00',
          '',
          10,
          1,
        ],
        [
          'A4 copy paper 80 gsm, 500 sheets',
          'a4-copy-paper-80gsm-500-sheets',
          'SAMPLE-001',
          '',
          '',
          '15.20',
          '',
          99,
          1,
        ],
      ]),
      'products.xlsx',
    );
    expect(good.body).toMatchObject({ saved: true, created: 1, updated: 1, errors: [] });
    expect(
      (await request(h.app).get('/v1/products/a4-copy-paper-80gsm-500-sheets')).body.price,
    ).toBe('15.20');
    expect(await stockOf(h.db, 'a4-copy-paper-80gsm-500-sheets')).toBe(99);

    const exported = await admin
      .get('/products/export.xlsx')
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.body as ArrayBuffer);
    expect(workbook.worksheets[0]?.getRow(1).getCell(1).value).toBe('name');
    expect(workbook.worksheets[0]?.rowCount).toBeGreaterThan(20);
  });

  it('writes an audit log that even the API cannot change', async () => {
    await admin.post('/faqs', { question: 'Q?', answer: 'A.' });
    const entries = await admin.get('/audit');
    expect(entries.body.entries[0]).toMatchObject({
      action: 'create',
      entity: 'faqs',
      admin_name: 'Test owner',
    });
    await expect(
      h.db.query(`set role service_role; update public.admin_audit_log set action = 'x'`),
    ).rejects.toThrow(/permission denied/);
    await h.db.query('reset role');
  });
});

describe('admin orders', () => {
  let admin: AdminClient;
  let orderId: number;
  beforeEach(async () => {
    admin = await signInAdmin(h);
    const paper = await productId(h.db, 'a4-copy-paper-80gsm-500-sheets');
    await request(h.app)
      .post('/v1/orders')
      .send(checkoutBody([{ productId: paper, variantId: null, quantity: 5 }]));
    const [row] = await h.db.query<{ id: number }>('select id from public.orders');
    orderId = row?.id ?? 0;
    h.sent.length = 0;
  });

  it('marks a bank transfer paid and emails the customer', async () => {
    expect((await admin.post(`/orders/${orderId}/mark-paid`)).status).toBe(200);
    const detail = await admin.get(`/orders/${orderId}`);
    expect(detail.body).toMatchObject({ paymentState: 'paid', orderState: 'processing' });
    expect(
      h.sent.some(
        (email) => email.to === 'buyer@example.test' && email.subject.includes('Payment received'),
      ),
    ).toBe(true);
    expect((await admin.post(`/orders/${orderId}/mark-paid`)).status).toBe(409);
  });

  it('only allows sensible status changes, and a cancel gives stock back once', async () => {
    expect(await stockOf(h.db, 'a4-copy-paper-80gsm-500-sheets')).toBe(115);
    expect((await admin.post(`/orders/${orderId}/state`, { state: 'completed' })).status).toBe(409);
    expect((await admin.post(`/orders/${orderId}/state`, { state: 'cancelled' })).status).toBe(200);
    expect(await stockOf(h.db, 'a4-copy-paper-80gsm-500-sheets')).toBe(120);
    expect((await admin.post(`/orders/${orderId}/state`, { state: 'cancelled' })).status).toBe(409);
    expect(await stockOf(h.db, 'a4-copy-paper-80gsm-500-sheets')).toBe(120);
    expect(h.sent.find((email) => email.to === 'buyer@example.test')?.subject).toBe(
      'Order OD-100001 has been cancelled',
    );
  });

  it('downloads an invoice and trashes and restores an order', async () => {
    const pdf = await admin.get(`/orders/${orderId}/invoice.pdf`);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((await admin.delete(`/orders/${orderId}`, false)).status).toBe(428);
    expect((await admin.delete(`/orders/${orderId}`)).status).toBe(200);
    expect((await admin.get('/orders')).body.total).toBe(0);
    expect((await admin.get('/orders?trash=1')).body.total).toBe(1);
    expect((await admin.post(`/orders/${orderId}/restore`)).status).toBe(200);
  });
});
