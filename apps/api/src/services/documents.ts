import {
  centsToDecimal,
  DOCUMENT_LABELS,
  DOCUMENT_PREFIXES,
  documentNumber,
  documentTotals,
  totalsToDecimals,
  type AdminDocument,
  type DocumentType,
} from '@od/shared';
import type { Client, Db } from '../db.js';
import { rows } from '../db.js';
import type { DocumentStore } from '../lib/documentStore.js';
import { renderDocumentPdf, type PdfBusiness, type PdfDocumentData } from '../lib/documentPdf.js';
import type { Mailer } from '../lib/email.js';
import { HttpError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import { loadPrivateSettings } from './settings.js';

// Invoices, official receipts, proforma invoices and order forms issued by hand in the
// admin. Issuing does three things: saves the document and its PDF, emails the PDF to
// the party, and (in the browser) downloads it. Saving comes first and does not depend
// on the email: a failed email never loses a document.

export interface DocumentRow {
  id: number;
  type: DocumentType;
  number: number;
  party_id: number | null;
  party: Record<string, string | null>;
  issue_date: string;
  fields: Record<string, string | null>;
  business: PdfBusiness;
  terms: string[];
  currency: string;
  vat_rate: string;
  prices_include_vat: boolean;
  subtotal: string;
  vat: string;
  freight: string;
  insurance: string;
  other_charges: string;
  deposit: string;
  total: string;
  balance: string;
  invoice_id: number | null;
  status: 'issued' | 'void';
  paid_at: Date | null;
  void_reason: string | null;
  voided_at: Date | null;
  pdf_path: string | null;
  emailed_at: Date | null;
  emailed_to: string | null;
  created_at: Date;
  [key: string]: unknown;
}

interface LineRow {
  description: string;
  hs_code: string | null;
  unit: string | null;
  qty: string;
  unit_price: string;
  amount: string;
  [key: string]: unknown;
}

const DOCUMENT_COLUMNS = `d.id, d.type, d.number, d.party_id, d.party, d.issue_date::text as issue_date,
  d.fields, d.business, d.terms, d.currency, d.vat_rate, d.prices_include_vat, d.subtotal, d.vat,
  d.freight, d.insurance, d.other_charges, d.deposit, d.total, d.balance, d.invoice_id, d.status,
  d.paid_at, d.void_reason, d.voided_at, d.pdf_path, d.emailed_at, d.emailed_to, d.created_at`;

interface DocumentSettings {
  vat_rate: string;
  prices_include_vat: boolean;
  terms_general: string;
  terms_proforma: string;
  [key: string]: unknown;
}

const termsList = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

function termsFor(type: DocumentType, settings: DocumentSettings): string[] {
  if (type === 'receipt') return [];
  return termsList(type === 'proforma' ? settings.terms_proforma : settings.terms_general);
}

/** Only the fields the user filled in, so the stored JSON stays small. */
function compactFields(fields: AdminDocument['fields']): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

export function displayNumber(row: { type: DocumentType; number: number }): string {
  return documentNumber(row.type, row.number);
}

/** The data the PDF needs, from a saved document and its lines. */
function pdfData(
  row: DocumentRow,
  lines: LineRow[],
  invoiceNumber: string | null,
): PdfDocumentData {
  return {
    type: row.type,
    number: displayNumber(row),
    issueDate: row.issue_date,
    party: { name: row.party.name ?? '', ...row.party },
    fields: row.fields,
    currency: row.currency,
    lines: lines.map((line) => ({
      description: line.description,
      hsCode: line.hs_code,
      unit: line.unit,
      qty: line.qty,
      unitPrice: line.unit_price,
      amount: line.amount,
    })),
    totals: {
      subtotal: row.subtotal,
      vat: row.vat,
      freight: row.freight,
      insurance: row.insurance,
      other_charges: row.other_charges,
      total: row.total,
      deposit: row.deposit,
      balance: row.balance,
    },
    vatEnabled: Number(row.vat_rate) > 0,
    pricesIncludeVat: row.prices_include_vat,
    terms: row.terms,
    invoiceNumber,
    voidReason: row.status === 'void' ? row.void_reason : null,
  };
}

/** Reads "INV-0007", "inv7" or "7" as a number search. */
function parseNumberSearch(q: string): { type: DocumentType | null; number: number } | null {
  const match = /^(inv|rct|pro|ord)?[-\s]?0*(\d{1,8})$/i.exec(q.trim());
  if (!match) return null;
  const prefix = match[1]?.toUpperCase();
  const type =
    (Object.entries(DOCUMENT_PREFIXES).find(([, value]) => value === prefix)?.[0] as
      DocumentType | undefined) ?? null;
  return { type, number: Number(match[2]) };
}

export interface DocumentFilters {
  q?: string;
  type?: DocumentType;
  status?: 'issued' | 'void';
  from?: string;
  to?: string;
  partyId?: number;
  page: number;
}

export function createDocuments(deps: {
  db: Db;
  store: DocumentStore;
  mailer: Mailer;
  logger: Logger;
}) {
  const { db, store, mailer, logger } = deps;

  async function loadSettings(client: Client): Promise<DocumentSettings> {
    const [settings] = await rows<DocumentSettings>(
      client,
      'select vat_rate::text as vat_rate, prices_include_vat, terms_general, terms_proforma from public.document_settings where id = 1',
    );
    if (!settings) throw new Error('document_settings row 1 is missing. Run the migrations.');
    return settings;
  }

  async function loadInvoiceForReceipt(client: Client, invoiceId: number): Promise<DocumentRow> {
    const [invoice] = await rows<DocumentRow>(
      client,
      `select ${DOCUMENT_COLUMNS} from public.documents d where d.id = $1`,
      [invoiceId],
    );
    if (!invoice || invoice.type !== 'invoice')
      throw new HttpError(400, 'invalid_input', 'That invoice was not found.', [
        { path: 'invoice_id', message: 'Choose an invoice' },
      ]);
    if (invoice.status === 'void')
      throw new HttpError(400, 'invalid_input', 'That invoice is void.', [
        { path: 'invoice_id', message: 'The invoice is void' },
      ]);
    return invoice;
  }

  /** Totals from the lines, VAT from the settings. Never from the browser. */
  function calculate(input: AdminDocument, settings: DocumentSettings) {
    const vatApplies = input.vat_enabled && input.type !== 'proforma' && input.type !== 'receipt';
    const totals = documentTotals({
      type: input.type,
      lines: input.lines.map((line) => ({ qty: line.qty, unitPrice: line.unit_price })),
      vatEnabled: vatApplies,
      vatRate: settings.vat_rate,
      pricesIncludeVat: input.prices_include_vat,
      freight: input.freight ?? undefined,
      insurance: input.insurance ?? undefined,
      otherCharges: input.other_charges ?? undefined,
      deposit: input.deposit ?? undefined,
      amount: input.amount ?? undefined,
    });
    if (totals.balance < 0)
      throw new HttpError(400, 'invalid_input', 'The deposit is more than the total.', [
        { path: 'deposit', message: 'The deposit cannot be more than the total' },
      ]);
    return { totals, vatRate: vatApplies ? settings.vat_rate : '0' };
  }

  /** Draws the PDF for a document that has not been issued, marked PREVIEW. */
  async function preview(input: AdminDocument): Promise<Buffer> {
    return db.tx(async (client) => {
      const settings = await loadSettings(client);
      const business = (await loadPrivateSettings(client)).business;
      const invoice = input.invoice_id
        ? await loadInvoiceForReceipt(client, input.invoice_id)
        : null;
      const { totals, vatRate } = calculate(input, settings);
      return renderDocumentPdf(
        {
          type: input.type,
          number: 'PREVIEW',
          issueDate: input.issue_date,
          party: input.party,
          fields: compactFields(input.fields),
          currency: input.currency,
          lines: input.lines.map((line, i) => ({
            description: line.description,
            hsCode: line.hs_code,
            unit: line.unit,
            qty: line.qty,
            unitPrice: line.unit_price,
            amount: centsToDecimal(totals.lineAmounts[i] ?? 0),
          })),
          totals: totalsToDecimals(totals),
          vatEnabled: Number(vatRate) > 0,
          pricesIncludeVat: input.prices_include_vat,
          terms: termsFor(input.type, settings),
          invoiceNumber: invoice ? displayNumber(invoice) : null,
          preview: true,
        },
        business,
      );
    });
  }

  async function getWithLines(client: Client | Db, id: number) {
    const run = <T extends Record<string, unknown>>(sql: string, params: unknown[]) =>
      'tx' in client ? client.query<T>(sql, params) : rows<T>(client, sql, params);
    const [row] = await run<DocumentRow>(
      `select ${DOCUMENT_COLUMNS} from public.documents d where d.id = $1`,
      [id],
    );
    if (!row) throw new HttpError(404, 'not_found', 'Not found.');
    const lines = await run<LineRow>(
      `select description, hs_code, unit, qty::text as qty, unit_price, amount
       from public.document_lines where document_id = $1 order by sort_order, id`,
      [id],
    );
    const [invoice] = row.invoice_id
      ? await run<{ type: DocumentType; number: number }>(
          'select type, number from public.documents where id = $1',
          [row.invoice_id],
        )
      : [];
    return { row, lines, invoiceNumber: invoice ? displayNumber(invoice) : null };
  }

  /** Emails the stored PDF. Returns whether it was sent; a failure is recorded, not thrown. */
  async function emailDocument(
    id: number,
    to?: string | null,
  ): Promise<{ emailed: boolean; to: string | null }> {
    const { row } = await getWithLines(db, id);
    const address = to ?? row.party.email ?? null;
    if (!address) return { emailed: false, to: null };
    if (!row.pdf_path) return { emailed: false, to: address };
    try {
      const pdf = await store.read(row.pdf_path);
      if (!pdf) throw new Error('stored PDF missing');
      const settings = await loadPrivateSettings(db);
      const company = row.business.legalName ?? row.business.siteName ?? settings.siteName;
      const label = DOCUMENT_LABELS[row.type];
      const number = displayNumber(row);
      const contact = [settings.phone, settings.shopEmail].filter(Boolean).join(' or ');
      await mailer.send({
        to: address,
        replyTo: settings.shopEmail ?? undefined,
        subject: `${label} ${number} from ${settings.siteName}${row.status === 'void' ? ' (void)' : ''}`,
        text: [
          `Hello ${row.party.name ?? ''},`.trim(),
          '',
          `Attached is ${label.toLowerCase()} ${number} from ${company}.`,
          row.status === 'void' ? `This document is void: ${row.void_reason ?? ''}` : null,
          '',
          contact
            ? `If you have any questions, reply to this email or contact us on ${contact}.`
            : null,
          '',
          company,
        ]
          .filter((line) => line !== null)
          .join('\n'),
        attachments: [{ filename: `${number}.pdf`, content: pdf }],
      });
      await db.query(
        'update public.documents set emailed_at = now(), emailed_to = $2 where id = $1',
        [id, address],
      );
      return { emailed: true, to: address };
    } catch (error) {
      // No address or name in the log: only which document and why.
      logger.warn('document email failed', {
        documentId: id,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return { emailed: false, to: address };
    }
  }

  /**
   * Saves the document, its lines and its PDF in one transaction, then emails it.
   * The number is taken from document_counters inside the transaction: the row lock
   * makes a second admin wait, so two documents never share a number, and if anything
   * fails before the commit the number is not used up.
   */
  async function issue(input: AdminDocument, adminId: string) {
    const saved = await db.tx(async (client) => {
      const settings = await loadSettings(client);
      const business = (await loadPrivateSettings(client)).business;
      const invoice = input.invoice_id
        ? await loadInvoiceForReceipt(client, input.invoice_id)
        : null;
      if (input.invoice_id && input.type !== 'receipt')
        throw new HttpError(400, 'invalid_input', 'Only a receipt can pay an invoice.');

      let partyId = input.party_id;
      if (partyId) {
        const [found] = await rows(client, 'select 1 from public.parties where id = $1', [partyId]);
        if (!found) throw new HttpError(400, 'invalid_input', 'That saved party was not found.');
      } else if (input.save_party) {
        const p = input.party;
        const [created] = await rows<{ id: number }>(
          client,
          `insert into public.parties (name, contact_person, address, country, phone, email, tin, notes)
           values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
          [p.name, p.contact_person, p.address, p.country, p.phone, p.email, p.tin, p.notes],
        );
        partyId = created?.id ?? null;
      }

      const { totals, vatRate } = calculate(input, settings);
      const [counter] = await rows<{ number: number }>(
        client,
        `update public.document_counters set next_number = next_number + 1
         where type = $1 returning next_number - 1 as number`,
        [input.type],
      );
      if (!counter) throw new Error(`document_counters row for ${input.type} is missing`);

      // The party copy keeps only what identifies them on paper, not private notes.
      const { notes: _notes, ...partySnapshot } = input.party;
      const terms = termsFor(input.type, settings);
      const money = totalsToDecimals(totals);
      const [doc] = await rows<{ id: number }>(
        client,
        `insert into public.documents (type, number, party_id, party, issue_date, fields, business, terms,
           currency, vat_rate, prices_include_vat, subtotal, vat, freight, insurance, other_charges,
           deposit, total, balance, invoice_id, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         returning id`,
        [
          input.type,
          counter.number,
          partyId,
          JSON.stringify(partySnapshot),
          input.issue_date,
          JSON.stringify(compactFields(input.fields)),
          JSON.stringify(business),
          JSON.stringify(terms),
          input.currency,
          vatRate,
          input.prices_include_vat,
          money.subtotal,
          money.vat,
          money.freight,
          money.insurance,
          money.other_charges,
          money.deposit,
          money.total,
          money.balance,
          invoice?.id ?? null,
          adminId,
        ],
      );
      if (!doc) throw new Error('document insert returned nothing');
      for (const [i, line] of input.lines.entries()) {
        await client.query(
          `insert into public.document_lines (document_id, sort_order, description, hs_code, unit, qty, unit_price, amount)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            doc.id,
            i,
            line.description,
            line.hs_code,
            line.unit,
            line.qty,
            line.unit_price,
            centsToDecimal(totals.lineAmounts[i] ?? 0),
          ],
        );
      }
      if (invoice) {
        await client.query(
          'update public.documents set paid_at = coalesce(paid_at, now()) where id = $1',
          [invoice.id],
        );
      }

      const { row, lines, invoiceNumber } = await getWithLines(client, doc.id);
      const pdf = await renderDocumentPdf(pdfData(row, lines, invoiceNumber), row.business);
      const key = await store.save(pdf);
      await client.query('update public.documents set pdf_path = $2 where id = $1', [doc.id, key]);
      return { id: doc.id, number: displayNumber(row) };
    });

    const email = await emailDocument(saved.id);
    return { ...saved, emailed: email.emailed, emailedTo: email.to };
  }

  /** Marks a document void, with the reason, and replaces its PDF with one marked VOID. */
  async function voidDocument(id: number, reason: string, adminId: string) {
    return db.tx(async (client) => {
      const [locked] = await rows<{ status: string }>(
        client,
        'select status from public.documents where id = $1 for update',
        [id],
      );
      if (!locked) throw new HttpError(404, 'not_found', 'Not found.');
      if (locked.status === 'void')
        throw new HttpError(409, 'already_void', 'This document is already void.');
      await client.query(
        `update public.documents set status = 'void', void_reason = $2, voided_at = now(), voided_by = $3
         where id = $1`,
        [id, reason, adminId],
      );
      const { row, lines, invoiceNumber } = await getWithLines(client, id);
      // A void receipt no longer pays its invoice, unless another receipt does.
      if (row.type === 'receipt' && row.invoice_id) {
        await client.query(
          `update public.documents set paid_at = null where id = $1 and not exists (
             select 1 from public.documents r
             where r.invoice_id = $1 and r.type = 'receipt' and r.status = 'issued')`,
          [row.invoice_id],
        );
      }
      const pdf = await renderDocumentPdf(pdfData(row, lines, invoiceNumber), row.business);
      const key = await store.save(pdf);
      await client.query('update public.documents set pdf_path = $2 where id = $1', [id, key]);
      return { id, number: displayNumber(row) };
    });
  }

  async function list(filters: DocumentFilters) {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    if (filters.q) {
      const number = parseNumberSearch(filters.q);
      const like = add(`%${filters.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
      if (number) {
        const numberClause = `d.number = ${add(number.number)}${number.type ? ` and d.type = ${add(number.type)}` : ''}`;
        where.push(`((${numberClause}) or d.party->>'name' ilike ${like})`);
      } else {
        where.push(`d.party->>'name' ilike ${like}`);
      }
    }
    if (filters.type) where.push(`d.type = ${add(filters.type)}`);
    if (filters.status) where.push(`d.status = ${add(filters.status)}`);
    if (filters.from) where.push(`d.issue_date >= ${add(filters.from)}::date`);
    if (filters.to) where.push(`d.issue_date <= ${add(filters.to)}::date`);
    if (filters.partyId) where.push(`d.party_id = ${add(filters.partyId)}`);
    const pageSize = 50;
    const limit = add(pageSize);
    const offset = add((filters.page - 1) * pageSize);
    const found = await db.query<DocumentRow & { total_count: number }>(
      `select ${DOCUMENT_COLUMNS}, count(*) over () as total_count
       from public.documents d
       ${where.length ? `where ${where.join(' and ')}` : ''}
       order by d.created_at desc, d.id desc limit ${limit} offset ${offset}`,
      params,
    );
    return {
      documents: found.map((row) => summary(row)),
      total: found[0]?.total_count ?? 0,
      page: filters.page,
      pageSize,
    };
  }

  function summary(row: DocumentRow) {
    return {
      id: row.id,
      type: row.type,
      number: displayNumber(row),
      partyId: row.party_id,
      partyName: row.party.name ?? '',
      partyEmail: row.party.email ?? null,
      issueDate: row.issue_date,
      currency: row.currency,
      total: row.total,
      status: row.status,
      paidAt: row.paid_at ? row.paid_at.toISOString() : null,
      voidReason: row.void_reason,
      emailedAt: row.emailed_at ? row.emailed_at.toISOString() : null,
      emailedTo: row.emailed_to,
      createdAt: row.created_at.toISOString(),
    };
  }

  async function get(id: number) {
    const { row, lines, invoiceNumber } = await getWithLines(db, id);
    const receipts = await db.query<DocumentRow>(
      `select ${DOCUMENT_COLUMNS} from public.documents d where d.invoice_id = $1 order by d.id`,
      [id],
    );
    return {
      ...summary(row),
      party: row.party,
      fields: row.fields,
      lines,
      subtotal: row.subtotal,
      vat: row.vat,
      vatRate: row.vat_rate,
      pricesIncludeVat: row.prices_include_vat,
      freight: row.freight,
      insurance: row.insurance,
      otherCharges: row.other_charges,
      deposit: row.deposit,
      balance: row.balance,
      invoiceId: row.invoice_id,
      invoiceNumber,
      receipts: receipts.map((receipt) => summary(receipt)),
    };
  }

  async function pdf(id: number): Promise<{ number: string; content: Buffer }> {
    const { row } = await getWithLines(db, id);
    const content = row.pdf_path ? await store.read(row.pdf_path) : null;
    if (!content) throw new HttpError(404, 'not_found', 'The PDF for this document is missing.');
    return { number: displayNumber(row), content };
  }

  return { preview, issue, emailDocument, voidDocument, list, get, pdf };
}

export type Documents = ReturnType<typeof createDocuments>;
