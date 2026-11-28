import {
  adminDocumentSchema,
  adminDocumentSettingsSchema,
  adminPartySchema,
  DOCUMENT_TYPES,
  emailDocumentSchema,
  idSchema,
  voidDocumentSchema,
} from '@od/shared';
import { Router } from 'express';
import { z } from 'zod';
import { rows } from '../../db.js';
import { HttpError } from '../../lib/errors.js';
import { parseInput } from '../../lib/validate.js';
import { audit, requireOwner } from '../../middleware/adminAuth.js';
import type { Services } from '../../services/container.js';

const listQuery = z.strictObject({
  q: z.string().trim().max(100).optional(),
  type: z.enum(DOCUMENT_TYPES).optional(),
  status: z.enum(['issued', 'void']).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  party_id: idSchema.optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});

const partyQuery = z.strictObject({ q: z.string().trim().max(100).optional() });

const pdfHeaders = (filename: string) => ({
  'Content-Type': 'application/pdf',
  'Content-Disposition': `attachment; filename="${filename}"`,
  'Cache-Control': 'no-store',
});

/** Documents (invoices, receipts, proformas, order forms), parties and document settings. */
export function documentRoutes(services: Services): Router {
  const { db, documents } = services;
  const router = Router();
  const adminId = (res: { locals: Record<string, unknown> }) =>
    (res.locals.admin as { id: string }).id;

  router.get('/documents', async (req, res) => {
    const query = parseInput(listQuery, req.query);
    res.json(
      await documents.list({
        q: query.q,
        type: query.type,
        status: query.status,
        from: query.from,
        to: query.to,
        partyId: query.party_id,
        page: query.page,
      }),
    );
  });

  router.post('/documents/preview', async (req, res) => {
    const input = parseInput(adminDocumentSchema, req.body);
    const pdf = await documents.preview(input);
    res.set({
      ...pdfHeaders('preview.pdf'),
      'Content-Disposition': 'inline; filename="preview.pdf"',
    });
    res.send(pdf);
  });

  router.post('/documents', async (req, res) => {
    const input = parseInput(adminDocumentSchema, req.body);
    const issued = await documents.issue(input, adminId(res));
    await audit(db, req, res, 'issue', `document ${issued.number}`, issued.id);
    if (issued.emailed) await audit(db, req, res, 'email', `document ${issued.number}`, issued.id);
    res.status(201).json(issued);
  });

  router.get('/documents/:id', async (req, res) => {
    res.json(await documents.get(parseInput(idSchema, req.params.id)));
  });

  router.get('/documents/:id/pdf', async (req, res) => {
    const { number, content } = await documents.pdf(parseInput(idSchema, req.params.id));
    res.set(pdfHeaders(`${number}.pdf`)).send(content);
  });

  router.post('/documents/:id/email', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const { to } = parseInput(emailDocumentSchema, req.body ?? {});
    const result = await documents.emailDocument(id, to);
    if (!result.to)
      throw new HttpError(
        400,
        'no_email',
        'This party has no email address. Enter one to send it.',
        [{ path: 'to', message: 'Enter an email address' }],
      );
    if (!result.emailed)
      throw new HttpError(502, 'email_failed', 'The email could not be sent. Try again later.');
    await audit(db, req, res, 'email', 'document', id);
    res.json(result);
  });

  router.post('/documents/:id/void', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const { reason } = parseInput(voidDocumentSchema, req.body);
    const voided = await documents.voidDocument(id, reason, adminId(res));
    await audit(db, req, res, 'void', `document ${voided.number}`, id);
    res.json(voided);
  });

  // Parties ---------------------------------------------------------------------

  router.get('/parties', async (req, res) => {
    const { q } = parseInput(partyQuery, req.query);
    const params: unknown[] = [];
    let where = '';
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
      where = 'where p.name ilike $1 or p.contact_person ilike $1 or p.email ilike $1';
    }
    res.json(
      await db.query(
        `select p.*, (select count(*) from public.documents d where d.party_id = p.id)::int as document_count
         from public.parties p ${where} order by lower(p.name), p.id limit 200`,
        params,
      ),
    );
  });

  router.get('/parties/:id', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const [party] = await db.query('select * from public.parties where id = $1', [id]);
    if (!party) throw new HttpError(404, 'not_found', 'Not found.');
    const docs = await documents.list({ partyId: id, page: 1 });
    res.json({ ...party, documents: docs.documents });
  });

  router.post('/parties', async (req, res) => {
    const p = parseInput(adminPartySchema, req.body);
    const [created] = await db.query<{ id: number }>(
      `insert into public.parties (name, contact_person, address, country, phone, email, tin, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [p.name, p.contact_person, p.address, p.country, p.phone, p.email, p.tin, p.notes],
    );
    await audit(db, req, res, 'create', 'party', created?.id ?? null);
    res.status(201).json(created);
  });

  router.put('/parties/:id', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const p = parseInput(adminPartySchema, req.body);
    const updated = await db.query(
      `update public.parties set name = $2, contact_person = $3, address = $4, country = $5, phone = $6,
         email = $7, tin = $8, notes = $9 where id = $1 returning id`,
      [id, p.name, p.contact_person, p.address, p.country, p.phone, p.email, p.tin, p.notes],
    );
    if (!updated.length) throw new HttpError(404, 'not_found', 'Not found.');
    await audit(db, req, res, 'update', 'party', id);
    res.json({ ok: true });
  });

  // Document settings (owner only) -------------------------------------------------

  // The VAT defaults every admin needs to show totals while making a document.
  router.get('/document-defaults', async (_req, res) => {
    const [defaults] = await db.query(
      'select vat_rate::text as vat_rate, prices_include_vat from public.document_settings where id = 1',
    );
    res.json(defaults);
  });

  router.get('/document-settings', requireOwner(), async (_req, res) => {
    const [settings] = await db.query(
      'select vat_rate::text as vat_rate, prices_include_vat, terms_general, terms_proforma from public.document_settings where id = 1',
    );
    const counters = await db.query<{ type: string; next_number: number; highest: number }>(
      `select c.type, c.next_number,
              coalesce((select max(d.number) from public.documents d where d.type = c.type), 0) as highest
       from public.document_counters c`,
    );
    res.json({
      ...settings,
      next_numbers: Object.fromEntries(counters.map((c) => [c.type, c.next_number])),
      highest_numbers: Object.fromEntries(counters.map((c) => [c.type, c.highest])),
    });
  });

  router.put('/document-settings', requireOwner(), async (req, res) => {
    const input = parseInput(adminDocumentSettingsSchema, req.body);
    await db.tx(async (client) => {
      await client.query(
        `update public.document_settings set vat_rate = $1, prices_include_vat = $2, terms_general = $3,
           terms_proforma = $4 where id = 1`,
        [input.vat_rate, input.prices_include_vat, input.terms_general, input.terms_proforma],
      );
      for (const [type, next] of Object.entries(input.next_numbers)) {
        // Lock the counter, then check no issued document already has that number or higher.
        await rows(client, 'select 1 from public.document_counters where type = $1 for update', [
          type,
        ]);
        const [highest] = await rows<{ highest: number }>(
          client,
          'select coalesce(max(number), 0) as highest from public.documents where type = $1',
          [type],
        );
        if (next <= (highest?.highest ?? 0))
          throw new HttpError(
            400,
            'invalid_input',
            `The next ${type} number must be higher than ${highest?.highest}, the last one issued.`,
            [{ path: `next_numbers.${type}`, message: `Must be more than ${highest?.highest}` }],
          );
        await client.query('update public.document_counters set next_number = $2 where type = $1', [
          type,
          next,
        ]);
      }
    });
    await audit(db, req, res, 'update', 'document_settings', 1);
    res.json({ ok: true });
  });

  return router;
}
