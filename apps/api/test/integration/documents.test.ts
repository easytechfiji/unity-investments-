import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  resetData,
  setShopSettings,
  signInAdmin,
  startHarness,
  type AdminClient,
  type Harness,
} from './harness.js';

// Update 02, part 4: invoices, receipts, proformas and order forms issued in the admin.

let h: Harness;
let owner: AdminClient;
const realSend = () => h.mailer.send.bind(h.mailer);
let send: Harness['mailer']['send'];

beforeAll(async () => {
  h = await startHarness();
  send = realSend();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await resetData(h.db);
  await setShopSettings(h.db);
  h.sent.length = 0;
  (h.mailer as { send: typeof send }).send = send;
  owner = await signInAdmin(h, 'owner');
});

const invoice = (overrides: Record<string, unknown> = {}) => ({
  type: 'invoice',
  party: { name: 'Mere Tester', email: 'mere@example.test', phone: '+679 123 4567' },
  issue_date: '2026-11-29',
  lines: [
    { description: 'Floral Vine Mauve, Double', qty: '2', unit_price: '50.00' },
    { description: 'Stripe Orange, King', qty: '1', unit_price: '60.00' },
  ],
  fields: { po_number: 'PO-77', payment_method: 'Cash' },
  ...overrides,
});

describe('issuing a document', () => {
  it('saves it with the next number, totals from the server, and emails the PDF', async () => {
    const res = await owner.post('/documents', invoice());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ number: 'INV-0001', emailed: true });

    const detail = await owner.get(`/documents/${res.body.id}`);
    // 160.00 including VAT at 12.5%: 142.22 before VAT, 17.78 VAT.
    expect(detail.body).toMatchObject({
      total: '160.00',
      subtotal: '142.22',
      vat: '17.78',
      status: 'issued',
    });
    expect(detail.body.lines.map((l: { amount: string }) => l.amount)).toEqual(['100.00', '60.00']);

    const [mail] = h.sent;
    expect(mail?.to).toBe('mere@example.test');
    expect(mail?.subject).toContain('INV-0001');
    expect(mail?.attachments?.[0]?.filename).toBe('INV-0001.pdf');
    expect(mail?.attachments?.[0]?.content.subarray(0, 4).toString()).toBe('%PDF');

    const pdf = await owner.get(`/documents/${res.body.id}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toContain('INV-0001.pdf');

    // The party was saved for next time.
    const parties = await owner.get('/parties?q=mere');
    expect(parties.body).toHaveLength(1);
  });

  it('numbers each type separately and never gives two documents the same number', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => owner.post('/documents', invoice({ save_party: false }))),
    );
    const numbers = results.map((res) => res.body.number).sort();
    expect(numbers).toEqual([
      'INV-0001',
      'INV-0002',
      'INV-0003',
      'INV-0004',
      'INV-0005',
      'INV-0006',
    ]);
    const order = await owner.post(
      '/documents',
      invoice({ type: 'order', fields: { taken_by: 'Sultan' }, deposit: '40.00' }),
    );
    expect(order.body.number).toBe('ORD-0001');
  });

  it('keeps the document when the email fails, and can send it again', async () => {
    (h.mailer as { send: typeof send }).send = () => Promise.reject(new Error('provider down'));
    const res = await owner.post('/documents', invoice());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ number: 'INV-0001', emailed: false });
    const listed = await owner.get('/documents');
    expect(listed.body.documents[0]).toMatchObject({ number: 'INV-0001', emailedAt: null });

    (h.mailer as { send: typeof send }).send = send;
    const again = await owner.post(`/documents/${res.body.id}/email`, {});
    expect(again.status).toBe(200);
    expect(h.sent).toHaveLength(1);
    const after = await owner.get(`/documents/${res.body.id}`);
    expect(after.body.emailedAt).not.toBeNull();
  });

  it('saves a document for a party with no email, marked as not emailed', async () => {
    const res = await owner.post('/documents', invoice({ party: { name: 'Walk in customer' } }));
    expect(res.body).toMatchObject({ emailed: false, emailedTo: null });
    expect(h.sent).toHaveLength(0);
    const again = await owner.post(`/documents/${res.body.id}/email`, {});
    expect(again.status).toBe(400);
    const typed = await owner.post(`/documents/${res.body.id}/email`, {
      to: 'walkin@example.test',
    });
    expect(typed.status).toBe(200);
  });

  it('refuses totals sent by the browser and a deposit larger than the total', async () => {
    const withTotal = await owner.post('/documents', { ...invoice(), total: '1.00' });
    expect(withTotal.status).toBe(400);
    const deposit = await owner.post('/documents', invoice({ type: 'order', deposit: '999.00' }));
    expect(deposit.status).toBe(400);
    // A refused document does not use up a number.
    const next = await owner.post('/documents', invoice());
    expect(next.body.number).toBe('INV-0001');
  });

  it('previews a PDF without saving anything or using a number', async () => {
    const res = await owner.post('/documents/preview', invoice());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect((await owner.get('/documents')).body.total).toBe(0);
    expect((await owner.post('/documents', invoice())).body.number).toBe('INV-0001');
  });

  it('draws every type of document', async () => {
    const proforma = await owner.post(
      '/documents',
      invoice({
        type: 'proforma',
        currency: 'USD',
        lines: [
          {
            description: 'Bedsheets',
            hs_code: '6302.31',
            unit: 'pcs',
            qty: '100',
            unit_price: '5.00',
          },
        ],
        freight: '120.00',
        fields: { incoterms: 'FOB', port_loading: 'Suva' },
      }),
    );
    expect(proforma.status).toBe(201);
    expect((await owner.get(`/documents/${proforma.body.id}`)).body).toMatchObject({
      total: '620.00',
      vat: '0.00',
      currency: 'USD',
    });
    const order = await owner.post('/documents', invoice({ type: 'order', deposit: '60.00' }));
    expect((await owner.get(`/documents/${order.body.id}`)).body).toMatchObject({
      total: '160.00',
      deposit: '60.00',
      balance: '100.00',
    });
  });
});

describe('receipts, voiding and the record', () => {
  it('a receipt for an invoice marks it paid, and voiding the receipt undoes that', async () => {
    const inv = await owner.post('/documents', invoice());
    const receipt = await owner.post('/documents', {
      type: 'receipt',
      party: { name: 'Mere Tester', email: 'mere@example.test' },
      issue_date: '2026-11-30',
      amount: '160.00',
      invoice_id: inv.body.id,
      fields: { paid_by: 'Cash' },
    });
    expect(receipt.status).toBe(201);
    expect(receipt.body.number).toBe('RCT-0001');
    const paid = await owner.get(`/documents/${inv.body.id}`);
    expect(paid.body.paidAt).not.toBeNull();
    expect(paid.body.receipts.map((r: { number: string }) => r.number)).toEqual(['RCT-0001']);

    const voided = await owner.post(`/documents/${receipt.body.id}/void`, {
      reason: 'Wrong amount',
    });
    expect(voided.status).toBe(200);
    const after = await owner.get(`/documents/${receipt.body.id}`);
    expect(after.body).toMatchObject({ status: 'void', voidReason: 'Wrong amount' });
    expect((await owner.get(`/documents/${inv.body.id}`)).body.paidAt).toBeNull();
    // The PDF is still there, now the VOID copy.
    expect((await owner.get(`/documents/${receipt.body.id}/pdf`)).status).toBe(200);
    // Voiding twice is refused.
    expect((await owner.post(`/documents/${receipt.body.id}/void`, { reason: 'x' })).status).toBe(
      409,
    );
  });

  it('cannot change or delete an issued document, even straight in the database', async () => {
    const inv = await owner.post('/documents', invoice());
    await expect(
      h.db.query(`update public.documents set total = 1 where id = $1`, [inv.body.id]),
    ).rejects.toThrow(/cannot be changed/);
    await expect(
      h.db.query(`delete from public.documents where id = $1`, [inv.body.id]),
    ).rejects.toThrow(/never deleted/);
    await expect(
      h.db.query(`update public.document_lines set amount = 1 where document_id = $1`, [
        inv.body.id,
      ]),
    ).rejects.toThrow(/never changed/);
  });

  it('writes issue, email and void to the activity log', async () => {
    const inv = await owner.post('/documents', invoice());
    await owner.post(`/documents/${inv.body.id}/void`, { reason: 'Typed the wrong customer' });
    const actions = (
      await h.db.query<{ action: string }>(
        `select action from public.admin_audit_log where entity like 'document%' order by id`,
      )
    ).map((row) => row.action);
    expect(actions).toEqual(['issue', 'email', 'void']);
  });

  it('finds documents by number, party, type and status', async () => {
    await owner.post('/documents', invoice());
    await owner.post('/documents', invoice({ party: { name: 'Seru Traders' } }));
    expect((await owner.get('/documents?q=INV-0002')).body.documents[0].partyName).toBe(
      'Seru Traders',
    );
    expect((await owner.get('/documents?q=seru')).body.total).toBe(1);
    expect((await owner.get('/documents?type=receipt')).body.total).toBe(0);
    expect((await owner.get('/documents?status=issued')).body.total).toBe(2);
  });
});

describe('document settings and permissions', () => {
  it('lets the owner set the next number, but not to one already used', async () => {
    await owner.post('/documents', invoice());
    const settings = await owner.get('/document-settings');
    expect(settings.body).toMatchObject({ vat_rate: '12.50', next_numbers: { invoice: 2 } });
    const body = {
      vat_rate: '12.5',
      prices_include_vat: true,
      terms_general: 'One term.',
      terms_proforma: 'Another term.',
      next_numbers: { invoice: 51, receipt: 61, proforma: 1, order: 51 },
    };
    expect((await owner.put('/document-settings', body)).status).toBe(200);
    expect((await owner.post('/documents', invoice())).body.number).toBe('INV-0051');
    const tooLow = await owner.put('/document-settings', {
      ...body,
      next_numbers: { ...body.next_numbers, invoice: 51 },
    });
    expect(tooLow.status).toBe(400);
  });

  it('staff can issue documents but cannot change document settings', async () => {
    const staff = await signInAdmin(h, 'staff');
    expect((await staff.post('/documents', invoice())).status).toBe(201);
    expect((await staff.get('/document-settings')).status).toBe(403);
  });

  it('nobody signed out can reach documents or parties', async () => {
    const request = (await import('supertest')).default;
    for (const path of ['/v1/admin/documents', '/v1/admin/parties', '/v1/admin/documents/1/pdf']) {
      expect((await request(h.app).get(path)).status).toBe(401);
    }
  });
});
