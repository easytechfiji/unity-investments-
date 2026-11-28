import {
  DEPOSIT_METHODS,
  DOCUMENT_LABELS,
  DOCUMENT_TYPES,
  INVOICE_PAYMENT_METHODS,
  RECEIPT_PAYMENT_METHODS,
  documentTotals,
  formatPrice,
  lineAmountCents,
  toCents,
  type DocumentType,
} from '@od/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api, ApiError, formatDate } from '../api';
import { Badge, Field, asText, type FieldDef, type Values } from '../components';

// Sales > Documents: invoices, official receipts, proforma invoices and order forms.
// One button issues a document: the API saves it (record and PDF), emails it to the
// party, and the browser downloads the PDF. Totals shown here are only a guide while
// typing; the API works out the real ones from the lines.

interface DocumentSummary {
  id: number;
  type: DocumentType;
  number: string;
  partyId: number | null;
  partyName: string;
  partyEmail: string | null;
  issueDate: string;
  currency: string;
  total: string;
  status: 'issued' | 'void';
  paidAt: string | null;
  voidReason: string | null;
  emailedAt: string | null;
  emailedTo: string | null;
  createdAt: string;
}

interface DocumentDetail extends DocumentSummary {
  party: Record<string, string | null>;
  fields: Record<string, string | null>;
  lines: {
    description: string;
    hs_code: string | null;
    unit: string | null;
    qty: string;
    unit_price: string;
    amount: string;
  }[];
  subtotal: string;
  vat: string;
  vatRate: string;
  pricesIncludeVat: boolean;
  freight: string;
  insurance: string;
  otherCharges: string;
  deposit: string;
  balance: string;
  invoiceId: number | null;
  invoiceNumber: string | null;
  receipts: DocumentSummary[];
}

interface Party {
  id: number;
  name: string;
  contact_person: string | null;
  address: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  tin: string | null;
  notes: string | null;
  document_count?: number;
}

const money = (value: string, currency = 'FJD') => formatPrice(toCents(value), currency);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Fiji' });

function message(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : 'Something went wrong. Try again.';
}

// List -----------------------------------------------------------------------------

export function Documents() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<{
    documents: DocumentSummary[];
    total: number;
    pageSize: number;
  } | null>(null);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    void api.get<typeof data>(`/documents?${params.toString()}`).then(setData);
  }, [params]);
  useEffect(load, [load]);

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };
  const page = Number(params.get('page') ?? '1');

  return (
    <>
      <h1>Documents</h1>
      <p className="row">
        <Link className="btn" to="/sales/documents/new">
          New document
        </Link>
      </p>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          set('q', search.trim() || null);
        }}
      >
        <label className="visually-hidden" htmlFor="doc-search">
          Search documents
        </label>
        <input
          id="doc-search"
          type="search"
          placeholder="Number or party, for example INV-0004"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button className="btn" type="submit">
          Search
        </button>
        <label className="visually-hidden" htmlFor="doc-type">
          Type
        </label>
        <select
          id="doc-type"
          value={params.get('type') ?? ''}
          onChange={(e) => set('type', e.target.value || null)}
        >
          <option value="">All types</option>
          {DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {DOCUMENT_LABELS[type]}
            </option>
          ))}
        </select>
        <label className="visually-hidden" htmlFor="doc-status">
          Status
        </label>
        <select
          id="doc-status"
          value={params.get('status') ?? ''}
          onChange={(e) => set('status', e.target.value || null)}
        >
          <option value="">Issued and void</option>
          <option value="issued">Issued</option>
          <option value="void">Void</option>
        </select>
        <label htmlFor="doc-from">From</label>
        <input
          id="doc-from"
          type="date"
          value={params.get('from') ?? ''}
          onChange={(e) => set('from', e.target.value || null)}
        />
        <label htmlFor="doc-to">To</label>
        <input
          id="doc-to"
          type="date"
          value={params.get('to') ?? ''}
          onChange={(e) => set('to', e.target.value || null)}
        />
      </form>
      {notice ? (
        <p className={notice.ok ? 'notice' : 'alert'} role="status">
          {notice.text}
        </p>
      ) : null}
      {!data ? (
        <p>Loading.</p>
      ) : data.documents.length === 0 ? (
        <p className="muted">No documents yet.</p>
      ) : (
        <>
          <p className="muted">{data.total} documents</p>
          <DocumentTable
            documents={data.documents}
            onChanged={(text, ok = true) => {
              setNotice({ ok, text });
              load();
            }}
          />
          <p className="row pager">
            {page > 1 ? (
              <button
                className="btn btn-plain"
                type="button"
                onClick={() => set('page', String(page - 1))}
              >
                Previous
              </button>
            ) : null}
            {page * data.pageSize < data.total ? (
              <button
                className="btn btn-plain"
                type="button"
                onClick={() => set('page', String(page + 1))}
              >
                Next
              </button>
            ) : null}
          </p>
        </>
      )}
    </>
  );
}

function DocumentTable({
  documents,
  onChanged,
}: {
  documents: DocumentSummary[];
  onChanged: (text: string, ok?: boolean) => void;
}) {
  return (
    <table className="list">
      <thead>
        <tr>
          <th scope="col">Number</th>
          <th scope="col">Type</th>
          <th scope="col">Party</th>
          <th scope="col">Date</th>
          <th scope="col" className="num">
            Total
          </th>
          <th scope="col">Status</th>
          <th scope="col">Email</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {documents.map((doc) => (
          <tr key={doc.id}>
            <td>
              <Link to={`/sales/documents/${doc.id}`}>{doc.number}</Link>
            </td>
            <td>{DOCUMENT_LABELS[doc.type]}</td>
            <td>{doc.partyName}</td>
            <td>{doc.issueDate}</td>
            <td className="num">{money(doc.total, doc.currency)}</td>
            <td>
              <Badge value={doc.status} />
              {doc.type === 'invoice' && doc.paidAt ? ' paid' : ''}
            </td>
            <td>{doc.emailedAt ? 'Emailed' : 'Not emailed'}</td>
            <td>
              <DocumentActions doc={doc} onChanged={onChanged} compact />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Download, Email again, Void and (for an invoice) Make receipt. */
function DocumentActions({
  doc,
  onChanged,
  compact = false,
}: {
  doc: DocumentSummary;
  onChanged: (text: string, ok?: boolean) => void;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'none' | 'email' | 'void'>('none');
  const [to, setTo] = useState(doc.partyEmail ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (caught) {
      onChanged(message(caught), false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? 'actions' : 'row'}>
      <button
        className="btn btn-plain"
        type="button"
        onClick={() =>
          void run(() => api.download(`/documents/${doc.id}/pdf`, `${doc.number}.pdf`))
        }
      >
        Download
      </button>
      <button
        className="btn btn-plain"
        type="button"
        onClick={() => setMode(mode === 'email' ? 'none' : 'email')}
      >
        {doc.emailedAt ? 'Email again' : 'Resend email'}
      </button>
      {doc.type === 'invoice' && doc.status === 'issued' ? (
        <button
          className="btn btn-plain"
          type="button"
          onClick={() => void navigate(`/sales/documents/new?type=receipt&invoice=${doc.id}`)}
        >
          Make receipt
        </button>
      ) : null}
      {doc.status === 'issued' ? (
        <button
          className="btn btn-plain"
          type="button"
          onClick={() => setMode(mode === 'void' ? 'none' : 'void')}
        >
          Void
        </button>
      ) : null}
      {mode === 'email' ? (
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const result = await api.post<{ to: string }>(`/documents/${doc.id}/email`, { to });
              setMode('none');
              onChanged(`${doc.number} emailed to ${result.to}.`);
            });
          }}
        >
          <label htmlFor={`email-${doc.id}`}>Send to</label>
          <input
            id={`email-${doc.id}`}
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <button className="btn" type="submit" disabled={busy}>
            Send
          </button>
        </form>
      ) : null}
      {mode === 'void' ? (
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await api.post(`/documents/${doc.id}/void`, { reason });
              setMode('none');
              onChanged(`${doc.number} is now void. Issue a new document to replace it.`);
            });
          }}
        >
          <label htmlFor={`void-${doc.id}`}>Reason for voiding</label>
          <input
            id={`void-${doc.id}`}
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
          <button className="btn btn-danger" type="submit" disabled={busy || !reason.trim()}>
            Void {doc.number}
          </button>
        </form>
      ) : null}
    </div>
  );
}

// Detail ---------------------------------------------------------------------------

export function DocumentView() {
  const { id } = useParams();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [params] = useSearchParams();

  const load = useCallback(() => {
    void api.get<DocumentDetail>(`/documents/${id}`).then(setDoc);
  }, [id]);
  useEffect(load, [load]);

  // Just issued: say whether it was emailed (set by DocumentNew in the address).
  const issued = params.get('issued');
  const shown =
    notice ??
    (issued === 'emailed'
      ? { ok: true, text: 'Issued, emailed and downloaded.' }
      : issued === 'not-emailed'
        ? {
            ok: false,
            text: 'Issued and downloaded, but not emailed. Use Resend email below to send it.',
          }
        : null);

  if (!doc) return <p>Loading.</p>;
  const cur = doc.currency;
  return (
    <>
      <p>
        <Link to="/sales/documents">Back to documents</Link>
      </p>
      <h1>
        {DOCUMENT_LABELS[doc.type]} {doc.number}
        {doc.status === 'void' ? ' (void)' : ''}
      </h1>
      {shown ? (
        <p className={shown.ok ? 'notice' : 'alert'} role="status">
          {shown.text}
        </p>
      ) : null}
      {doc.status === 'void' ? <p className="alert">Void: {doc.voidReason}</p> : null}
      <DocumentActions
        doc={doc}
        onChanged={(text, ok = true) => {
          setNotice({ ok, text });
          load();
        }}
      />
      <div className="grid2">
        <section className="panel">
          <h2>{doc.type === 'receipt' ? 'Received from' : 'Party'}</h2>
          <p>
            {doc.partyId ? (
              <Link to={`/sales/parties/${doc.partyId}`}>{doc.partyName}</Link>
            ) : (
              doc.partyName
            )}
          </p>
          {['contact_person', 'address', 'country', 'phone', 'email', 'tin'].map((key) =>
            doc.party[key] ? (
              <p key={key} className="muted">
                {doc.party[key]}
              </p>
            ) : null,
          )}
        </section>
        <section className="panel">
          <h2>Details</h2>
          <p>Date: {doc.issueDate}</p>
          <p>
            {doc.emailedAt
              ? `Emailed to ${doc.emailedTo} on ${formatDate(doc.emailedAt)}`
              : 'Not emailed'}
          </p>
          {doc.type === 'invoice' ? (
            <p>{doc.paidAt ? `Paid ${formatDate(doc.paidAt)}` : 'Not marked paid'}</p>
          ) : null}
          {doc.invoiceNumber && doc.invoiceId ? (
            <p>
              For invoice <Link to={`/sales/documents/${doc.invoiceId}`}>{doc.invoiceNumber}</Link>
            </p>
          ) : null}
          {Object.entries(doc.fields).map(([key, value]) => (
            <p key={key} className="muted">
              {key.replace(/_/g, ' ')}: {value}
            </p>
          ))}
        </section>
      </div>
      {doc.lines.length ? (
        <table className="list">
          <thead>
            <tr>
              <th scope="col">Description</th>
              <th scope="col" className="num">
                Qty
              </th>
              <th scope="col" className="num">
                Unit price
              </th>
              <th scope="col" className="num">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((line, i) => (
              <tr key={i}>
                <td>
                  {line.description}
                  {line.hs_code ? <div className="muted">HS {line.hs_code}</div> : null}
                </td>
                <td className="num">{line.qty.replace(/\.?0+$/, '')}</td>
                <td className="num">{money(line.unit_price, cur)}</td>
                <td className="num">{money(line.amount, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <dl className="totals">
        {doc.type === 'proforma' ? (
          <>
            <dt>Subtotal</dt>
            <dd>{money(doc.subtotal, cur)}</dd>
            <dt>Freight</dt>
            <dd>{money(doc.freight, cur)}</dd>
            <dt>Insurance</dt>
            <dd>{money(doc.insurance, cur)}</dd>
            <dt>Other charges</dt>
            <dd>{money(doc.otherCharges, cur)}</dd>
          </>
        ) : doc.type !== 'receipt' ? (
          <>
            <dt>Subtotal (VEP)</dt>
            <dd>{money(doc.subtotal)}</dd>
            <dt>VAT</dt>
            <dd>{money(doc.vat)}</dd>
          </>
        ) : null}
        <dt>Total</dt>
        <dd>
          <strong>{money(doc.total, cur)}</strong>
        </dd>
        {doc.type === 'order' ? (
          <>
            <dt>Deposit paid</dt>
            <dd>{money(doc.deposit)}</dd>
            <dt>Balance due</dt>
            <dd>{money(doc.balance)}</dd>
          </>
        ) : null}
      </dl>
      {doc.receipts.length ? (
        <>
          <h2>Receipts for this invoice</h2>
          <ul>
            {doc.receipts.map((receipt) => (
              <li key={receipt.id}>
                <Link to={`/sales/documents/${receipt.id}`}>{receipt.number}</Link>,{' '}
                {money(receipt.total)}
                {receipt.status === 'void' ? ' (void)' : ''}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

// New document ---------------------------------------------------------------------

interface LineInput {
  description: string;
  hs_code: string;
  unit: string;
  qty: string;
  unit_price: string;
}

const emptyLine = (): LineInput => ({
  description: '',
  hs_code: '',
  unit: '',
  qty: '1',
  unit_price: '',
});

const PARTY_FIELDS: FieldDef[] = [
  { name: 'name', label: 'Name or company', type: 'text', required: true },
  { name: 'contact_person', label: 'Contact person', type: 'text' },
  { name: 'address', label: 'Address', type: 'textarea' },
  { name: 'country', label: 'Country', type: 'text' },
  { name: 'phone', label: 'Phone', type: 'text' },
  { name: 'email', label: 'Email', type: 'text', hint: 'The document is emailed here.' },
  { name: 'tin', label: 'TIN', type: 'text' },
];

const options = (list: readonly string[]) => list.map((value) => ({ value, label: value }));

function fieldsFor(type: DocumentType): FieldDef[] {
  switch (type) {
    case 'invoice':
      return [
        { name: 'po_number', label: 'PO number', type: 'text' },
        {
          name: 'payment_method',
          label: 'Payment method',
          type: 'select',
          options: options(INVOICE_PAYMENT_METHODS),
        },
        {
          name: 'payment_reference',
          label: 'Payment reference',
          type: 'text',
          hint: 'Cheque, transfer or M-PAiSA number.',
        },
      ];
    case 'receipt':
      return [
        {
          name: 'paid_by',
          label: 'Paid by',
          type: 'select',
          options: options(RECEIPT_PAYMENT_METHODS),
          required: true,
        },
        { name: 'reference', label: 'Cheque, reference or M-PAiSA number', type: 'text' },
        { name: 'being_payment_for', label: 'Being payment for', type: 'text' },
      ];
    case 'proforma':
      return [
        { name: 'valid_until', label: 'Valid until', type: 'date' },
        { name: 'buyer_ref', label: 'Buyer reference or PO', type: 'text' },
        {
          name: 'incoterms',
          label: 'Incoterms',
          type: 'text',
          hint: 'For example FOB Suva or CIF.',
        },
        { name: 'payment_terms', label: 'Payment terms', type: 'text' },
        { name: 'shipment_by', label: 'Shipment by', type: 'text' },
        { name: 'port_loading', label: 'Port of loading', type: 'text' },
        { name: 'port_discharge', label: 'Port of discharge', type: 'text' },
        { name: 'country_origin', label: 'Country of origin', type: 'text' },
      ];
    case 'order':
      return [
        { name: 'deliver_to', label: 'Deliver to', type: 'textarea' },
        { name: 'required_by', label: 'Required by', type: 'date' },
        { name: 'taken_by', label: 'Taken by', type: 'text' },
        {
          name: 'deposit_method',
          label: 'Deposit paid by',
          type: 'select',
          options: options(DEPOSIT_METHODS),
        },
      ];
  }
}

export function DocumentNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialType = (DOCUMENT_TYPES as readonly string[]).includes(params.get('type') ?? '')
    ? (params.get('type') as DocumentType)
    : 'invoice';
  const [type, setType] = useState<DocumentType>(initialType);
  const [defaults, setDefaults] = useState<{
    vat_rate: string;
    prices_include_vat: boolean;
  } | null>(null);
  const [party, setParty] = useState<Values>({});
  const [partyId, setPartyId] = useState<number | null>(null);
  const [saveParty, setSaveParty] = useState(true);
  const [partySearch, setPartySearch] = useState('');
  const [partyResults, setPartyResults] = useState<Party[]>([]);
  const [issueDate, setIssueDate] = useState(today());
  const [currency, setCurrency] = useState('FJD');
  const [lines, setLines] = useState<LineInput[]>([emptyLine()]);
  const [fields, setFields] = useState<Values>({});
  const [vatEnabled, setVatEnabled] = useState(true);
  const [pricesIncludeVat, setPricesIncludeVat] = useState(true);
  const [extra, setExtra] = useState<Values>({});
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .get<{ vat_rate: string; prices_include_vat: boolean }>('/document-defaults')
      .then((d) => {
        setDefaults(d);
        setPricesIncludeVat(d.prices_include_vat);
        setVatEnabled(Number(d.vat_rate) > 0);
      });
  }, []);

  // "Make receipt" from an invoice: fill in the party, amount and what it pays for.
  useEffect(() => {
    const from = params.get('invoice');
    if (!from) return;
    void api.get<DocumentDetail>(`/documents/${from}`).then((inv) => {
      setType('receipt');
      setInvoiceId(inv.id);
      setInvoiceNumber(inv.number);
      setPartyId(inv.partyId);
      setParty({ ...inv.party });
      setExtra((current) => ({ ...current, amount: inv.total }));
      setFields((current) => ({ ...current, being_payment_for: `Invoice ${inv.number}` }));
    });
  }, [params]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  useEffect(() => {
    const q = partySearch.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      void api.get<Party[]>(`/parties?q=${encodeURIComponent(q)}`).then(setPartyResults);
    }, 250);
    return () => clearTimeout(timer);
  }, [partySearch]);

  // A guide while typing. The API calculates the real totals when the document is saved.
  const totals = useMemo(() => {
    try {
      return documentTotals({
        type,
        lines: lines
          .filter((line) => line.qty.trim() && line.unit_price.trim())
          .map((line) => ({ qty: line.qty, unitPrice: line.unit_price })),
        vatEnabled: vatEnabled && type !== 'proforma' && type !== 'receipt',
        vatRate: defaults?.vat_rate ?? '0',
        pricesIncludeVat,
        freight: asText(extra.freight),
        insurance: asText(extra.insurance),
        otherCharges: asText(extra.other_charges),
        deposit: asText(extra.deposit),
        amount: asText(extra.amount),
      });
    } catch {
      return null;
    }
  }, [type, lines, vatEnabled, pricesIncludeVat, defaults, extra]);

  const payload = () => ({
    type,
    party_id: partyId,
    party: Object.fromEntries(PARTY_FIELDS.map((def) => [def.name, asText(party[def.name])])),
    save_party: saveParty,
    issue_date: issueDate,
    currency: type === 'proforma' ? currency : 'FJD',
    lines: type === 'receipt' ? [] : lines.map((line) => ({ ...line })),
    vat_enabled: vatEnabled,
    prices_include_vat: pricesIncludeVat,
    amount: type === 'receipt' ? asText(extra.amount) : null,
    freight: type === 'proforma' ? asText(extra.freight) : null,
    insurance: type === 'proforma' ? asText(extra.insurance) : null,
    other_charges: type === 'proforma' ? asText(extra.other_charges) : null,
    deposit: type === 'order' ? asText(extra.deposit) : null,
    invoice_id: type === 'receipt' ? invoiceId : null,
    fields: Object.fromEntries(
      [...fieldsFor(type), { name: 'notes' }].map((def) => [def.name, asText(fields[def.name])]),
    ),
  });

  async function preview() {
    setBusy(true);
    setErrors({});
    setNotice(null);
    try {
      const blob = await api.post<Blob>('/documents/preview', payload());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (caught) {
      if (caught instanceof ApiError) setErrors(caught.fields);
      setNotice({ ok: false, text: message(caught) });
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    setBusy(true);
    setErrors({});
    setNotice(null);
    try {
      const issued = await api.post<{ id: number; number: string; emailed: boolean }>(
        '/documents',
        payload(),
      );
      // The document is saved. Download it, then show it.
      await api
        .download(`/documents/${issued.id}/pdf`, `${issued.number}.pdf`)
        .catch(() => undefined);
      void navigate(
        `/sales/documents/${issued.id}?issued=${issued.emailed ? 'emailed' : 'not-emailed'}`,
      );
    } catch (caught) {
      if (caught instanceof ApiError) setErrors(caught.fields);
      setNotice({ ok: false, text: message(caught) });
      setBusy(false);
    }
  }

  const shownResults = partySearch.trim().length >= 2 ? partyResults : [];
  const updateLine = (index: number, change: Partial<LineInput>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...change } : line)));
  const cur = type === 'proforma' ? currency : 'FJD';
  const show = (cents: number) => formatPrice(cents, cur);
  const lineAmount = (line: LineInput) => {
    if (!line.qty.trim() || !line.unit_price.trim()) return '';
    try {
      return show(lineAmountCents(line.qty, line.unit_price));
    } catch {
      return '';
    }
  };

  return (
    <>
      <p>
        <Link to="/sales/documents">Back to documents</Link>
      </p>
      <h1>New {DOCUMENT_LABELS[type].toLowerCase()}</h1>
      {notice ? (
        <p className={notice.ok ? 'notice' : 'alert'} role="status">
          {notice.text}
        </p>
      ) : null}
      <form
        className="form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void issue();
        }}
      >
        <div className="grid2">
          <Field
            def={{
              name: 'type',
              label: 'Type of document',
              type: 'select',
              options: DOCUMENT_TYPES.map((value) => ({ value, label: DOCUMENT_LABELS[value] })),
            }}
            value={type}
            onChange={(value) => {
              if (value) setType(value as DocumentType);
              setPreviewUrl(null);
            }}
          />
          <Field
            def={{ name: 'issue_date', label: 'Date', type: 'date' }}
            value={issueDate}
            error={errors.issue_date}
            onChange={(value) => setIssueDate(asText(value))}
          />
        </div>
        {invoiceNumber ? <p className="muted">This receipt pays invoice {invoiceNumber}.</p> : null}

        <h2>
          {type === 'receipt'
            ? 'Received from'
            : type === 'proforma'
              ? 'Buyer or consignee'
              : 'Customer'}
        </h2>
        <div className="field">
          <label htmlFor="party-search">
            Find a saved party
            <span className="hint">
              Type two or more letters of the name, then choose one. Or fill in a new one below.
            </span>
          </label>
          <input
            id="party-search"
            type="search"
            value={partySearch}
            onChange={(event) => setPartySearch(event.target.value)}
          />
          {shownResults.length ? (
            <ul className="picker">
              {shownResults.map((found) => (
                <li key={found.id}>
                  <button
                    type="button"
                    className="btn btn-plain"
                    onClick={() => {
                      setPartyId(found.id);
                      setParty({ ...found });
                      setPartySearch('');
                      setPartyResults([]);
                    }}
                  >
                    {found.name}
                    {found.email ? `, ${found.email}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {partyId ? (
          <p className="muted">
            Using saved party {asText(party.name)}. Changes below apply to this document only.{' '}
            <button
              type="button"
              className="btn btn-plain"
              onClick={() => {
                setPartyId(null);
                setParty({});
              }}
            >
              Use a new party instead
            </button>
          </p>
        ) : null}
        <div className="grid2">
          {PARTY_FIELDS.map((def) => (
            <Field
              key={def.name}
              def={{ ...def, name: `party.${def.name}` }}
              value={party[def.name]}
              error={errors[`party.${def.name}`]}
              onChange={(value) => setParty((current) => ({ ...current, [def.name]: value }))}
            />
          ))}
        </div>
        {!partyId ? (
          <Field
            def={{ name: 'save_party', label: 'Save this party for next time', type: 'checkbox' }}
            value={saveParty}
            onChange={(value) => setSaveParty(Boolean(value))}
          />
        ) : null}

        <h2>Details</h2>
        <div className="grid2">
          {type === 'proforma' ? (
            <Field
              def={{
                name: 'currency',
                label: 'Currency',
                type: 'text',
                hint: 'Three letters, for example FJD or USD.',
              }}
              value={currency}
              error={errors.currency}
              onChange={(value) => setCurrency(asText(value).toUpperCase())}
            />
          ) : null}
          {fieldsFor(type).map((def) => (
            <Field
              key={def.name}
              def={{ ...def, name: `fields.${def.name}` }}
              value={fields[def.name]}
              error={errors[`fields.${def.name}`]}
              onChange={(value) => setFields((current) => ({ ...current, [def.name]: value }))}
            />
          ))}
          {type === 'receipt' ? (
            <Field
              def={{
                name: 'amount',
                label: 'Amount received (FJD)',
                type: 'money',
                required: true,
              }}
              value={extra.amount}
              error={errors.amount}
              onChange={(value) => setExtra((current) => ({ ...current, amount: value }))}
            />
          ) : null}
        </div>

        {type !== 'receipt' ? (
          <>
            <h2>Items</h2>
            {errors.lines ? <p className="error">{errors.lines}</p> : null}
            <table className="list lines">
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  {type === 'proforma' ? (
                    <>
                      <th scope="col">HS code</th>
                      <th scope="col">Unit</th>
                    </>
                  ) : null}
                  <th scope="col">Qty</th>
                  <th scope="col">Unit price ({cur})</th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        aria-label={`Line ${i + 1} description`}
                        aria-invalid={errors[`lines.${i}.description`] ? true : undefined}
                        value={line.description}
                        onChange={(e) => updateLine(i, { description: e.target.value })}
                      />
                    </td>
                    {type === 'proforma' ? (
                      <>
                        <td>
                          <input
                            aria-label={`Line ${i + 1} HS code`}
                            className="short"
                            value={line.hs_code}
                            onChange={(e) => updateLine(i, { hs_code: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Line ${i + 1} unit`}
                            className="short"
                            value={line.unit}
                            onChange={(e) => updateLine(i, { unit: e.target.value })}
                          />
                        </td>
                      </>
                    ) : null}
                    <td>
                      <input
                        aria-label={`Line ${i + 1} quantity`}
                        aria-invalid={errors[`lines.${i}.qty`] ? true : undefined}
                        className="short"
                        inputMode="decimal"
                        value={line.qty}
                        onChange={(e) => updateLine(i, { qty: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Line ${i + 1} unit price`}
                        aria-invalid={errors[`lines.${i}.unit_price`] ? true : undefined}
                        className="short"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={line.unit_price}
                        onChange={(e) => updateLine(i, { unit_price: e.target.value })}
                      />
                    </td>
                    <td className="num">{lineAmount(line)}</td>
                    <td>
                      {lines.length > 1 ? (
                        <button
                          type="button"
                          className="btn btn-plain"
                          onClick={() => setLines((current) => current.filter((_, j) => j !== i))}
                        >
                          Remove<span className="visually-hidden"> line {i + 1}</span>
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Object.keys(errors).some((key) => key.startsWith('lines.')) ? (
              <p className="error">
                Check the highlighted lines: each needs a description, a quantity and a price.
              </p>
            ) : null}
            <p>
              <button
                type="button"
                className="btn btn-plain"
                onClick={() => setLines((current) => [...current, emptyLine()])}
              >
                Add a line
              </button>
            </p>

            <div className="grid2">
              {type === 'proforma' ? (
                (['freight', 'insurance', 'other_charges'] as const).map((name) => (
                  <Field
                    key={name}
                    def={{
                      name,
                      label: `${name === 'other_charges' ? 'Other charges' : name[0]!.toUpperCase() + name.slice(1)} (${cur})`,
                      type: 'money',
                    }}
                    value={extra[name]}
                    error={errors[name]}
                    onChange={(value) => setExtra((current) => ({ ...current, [name]: value }))}
                  />
                ))
              ) : (
                <>
                  <Field
                    def={{
                      name: 'vat_enabled',
                      label: `Charge VAT${defaults ? ` at ${Number(defaults.vat_rate)}%` : ''}`,
                      type: 'checkbox',
                      hint: 'The rate is set in Settings, Document settings.',
                    }}
                    value={vatEnabled}
                    onChange={(value) => setVatEnabled(Boolean(value))}
                  />
                  {vatEnabled ? (
                    <Field
                      def={{
                        name: 'prices_include_vat',
                        label: 'Prices above include VAT',
                        type: 'checkbox',
                      }}
                      value={pricesIncludeVat}
                      onChange={(value) => setPricesIncludeVat(Boolean(value))}
                    />
                  ) : null}
                  {type === 'order' ? (
                    <Field
                      def={{ name: 'deposit', label: 'Deposit paid (FJD)', type: 'money' }}
                      value={extra.deposit}
                      error={errors.deposit}
                      onChange={(value) => setExtra((current) => ({ ...current, deposit: value }))}
                    />
                  ) : null}
                </>
              )}
            </div>
          </>
        ) : null}

        <Field
          def={{
            name: 'fields.notes',
            label: 'Notes',
            type: 'textarea',
            hint: 'Printed on the document.',
          }}
          value={fields.notes}
          error={errors['fields.notes']}
          onChange={(value) => setFields((current) => ({ ...current, notes: value }))}
        />

        {totals ? (
          <dl className="totals" aria-live="polite">
            {type === 'proforma' ? (
              <>
                <dt>Subtotal</dt>
                <dd>{show(totals.subtotal)}</dd>
                <dt>Freight, insurance and other charges</dt>
                <dd>{show(totals.freight + totals.insurance + totals.otherCharges)}</dd>
              </>
            ) : type !== 'receipt' ? (
              <>
                <dt>Subtotal (VEP)</dt>
                <dd>{show(totals.subtotal)}</dd>
                <dt>VAT</dt>
                <dd>{show(totals.vat)}</dd>
              </>
            ) : null}
            <dt>Total</dt>
            <dd>
              <strong>{show(totals.total)}</strong>
            </dd>
            {type === 'order' ? (
              <>
                <dt>Balance due</dt>
                <dd>{show(totals.balance)}</dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="muted">
            Check the amounts: totals show once every amount is a number such as 12.50.
          </p>
        )}

        <p className="row">
          <button
            type="button"
            className="btn btn-plain"
            disabled={busy}
            onClick={() => void preview()}
          >
            Preview PDF
          </button>
          {previewUrl ? (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer">
              Open the preview
            </a>
          ) : null}
        </p>
        <p className="muted">
          Issue saves the document with the next number, emails it to the party
          {asText(party.email)
            ? ` (${asText(party.email)})`
            : ' (no email entered, so it will not be emailed)'}{' '}
          and downloads the PDF. An issued document cannot be changed, only voided.
        </p>
        <p>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Working' : `Issue ${DOCUMENT_LABELS[type].toLowerCase()}`}
          </button>
        </p>
      </form>
    </>
  );
}

// Parties --------------------------------------------------------------------------

export function Parties() {
  const [q, setQ] = useState('');
  const [list, setList] = useState<Party[] | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      void api
        .get<Party[]>(`/parties${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
        .then(setList);
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);
  return (
    <>
      <h1>Parties</h1>
      <p className="muted">Saved customers and companies that documents are made out to.</p>
      <p className="row">
        <Link className="btn" to="/sales/parties/new">
          Add party
        </Link>
        <label className="visually-hidden" htmlFor="party-filter">
          Search parties
        </label>
        <input
          id="party-filter"
          type="search"
          placeholder="Name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </p>
      {!list ? (
        <p>Loading.</p>
      ) : list.length === 0 ? (
        <p className="muted">No parties yet. They are saved when you issue a document.</p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Phone</th>
              <th scope="col">Email</th>
              <th scope="col" className="num">
                Documents
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((party) => (
              <tr key={party.id}>
                <td>
                  <Link to={`/sales/parties/${party.id}`}>{party.name}</Link>
                </td>
                <td>{party.phone}</td>
                <td>{party.email}</td>
                <td className="num">{party.document_count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

const PARTY_FORM: FieldDef[] = [
  ...PARTY_FIELDS,
  { name: 'notes', label: 'Notes', type: 'textarea', hint: 'For staff only. Not printed.' },
];

export function PartyEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const [values, setValues] = useState<Values>({});
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (isNew) return;
    void api.get<Party & { documents: DocumentSummary[] }>(`/parties/${id}`).then((party) => {
      setValues({ ...party });
      setDocuments(party.documents);
    });
  }, [id, isNew]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    const body = Object.fromEntries(PARTY_FORM.map((def) => [def.name, asText(values[def.name])]));
    try {
      if (isNew) {
        const created = await api.post<{ id: number }>('/parties', body);
        void navigate(`/sales/parties/${created.id}`, { replace: true });
      } else {
        await api.put(`/parties/${id}`, body);
      }
      setNotice({
        ok: true,
        text: 'Saved. Documents already issued keep the details they were issued with.',
      });
    } catch (caught) {
      if (caught instanceof ApiError) setErrors(caught.fields);
      setNotice({ ok: false, text: message(caught) });
    }
  }

  return (
    <>
      <p>
        <Link to="/sales/parties">Back to parties</Link>
      </p>
      <h1>{isNew ? 'Add party' : asText(values.name) || 'Party'}</h1>
      {notice ? (
        <p className={notice.ok ? 'notice' : 'alert'} role="status">
          {notice.text}
        </p>
      ) : null}
      <form className="form" onSubmit={(event) => void save(event)} noValidate>
        <div className="grid2">
          {PARTY_FORM.map((def) => (
            <Field
              key={def.name}
              def={def}
              value={values[def.name]}
              error={errors[def.name]}
              onChange={(value) => setValues((current) => ({ ...current, [def.name]: value }))}
            />
          ))}
        </div>
        <p>
          <button className="btn" type="submit">
            Save
          </button>
        </p>
      </form>
      {!isNew ? (
        <>
          <h2>Documents</h2>
          {documents.length ? (
            <DocumentTable
              documents={documents}
              onChanged={(text, ok) => setNotice({ ok: ok ?? true, text })}
            />
          ) : (
            <p className="muted">No documents for this party yet.</p>
          )}
        </>
      ) : null}
    </>
  );
}

// Document settings (owner) --------------------------------------------------------

interface SettingsData {
  vat_rate: string;
  prices_include_vat: boolean;
  terms_general: string;
  terms_proforma: string;
  next_numbers: Record<DocumentType, number>;
  highest_numbers: Record<DocumentType, number>;
}

export function DocumentSettings() {
  const [values, setValues] = useState<SettingsData | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void api.get<SettingsData>('/document-settings').then(setValues);
  }, []);
  if (!values) return <p>Loading.</p>;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!values) return;
    setErrors({});
    try {
      await api.put('/document-settings', {
        vat_rate: String(values.vat_rate),
        prices_include_vat: values.prices_include_vat,
        terms_general: values.terms_general,
        terms_proforma: values.terms_proforma,
        next_numbers: values.next_numbers,
      });
      setNotice({ ok: true, text: 'Document settings saved.' });
    } catch (caught) {
      if (caught instanceof ApiError) setErrors(caught.fields);
      setNotice({ ok: false, text: message(caught) });
    }
  }

  return (
    <>
      <h1>Document settings</h1>
      {notice ? (
        <p className={notice.ok ? 'notice' : 'alert'} role="status">
          {notice.text}
        </p>
      ) : null}
      <form className="form" onSubmit={(event) => void save(event)} noValidate>
        <h2>VAT</h2>
        <div className="grid2">
          <Field
            def={{
              name: 'vat_rate',
              label: 'VAT rate (%)',
              type: 'text',
              hint: 'For example 12.5. Used for new documents only.',
            }}
            value={values.vat_rate}
            error={errors.vat_rate}
            onChange={(value) => setValues({ ...values, vat_rate: asText(value) })}
          />
          <Field
            def={{
              name: 'prices_include_vat',
              label: 'Prices include VAT by default',
              type: 'checkbox',
              hint: 'Can be changed on each document.',
            }}
            value={values.prices_include_vat}
            onChange={(value) => setValues({ ...values, prices_include_vat: Boolean(value) })}
          />
        </div>

        <h2>Next numbers</h2>
        <p className="muted">
          The number the next document of each type gets. Set it once so the website continues after
          the paper books. It must be higher than the last one issued.
        </p>
        <div className="grid2">
          {DOCUMENT_TYPES.map((type) => (
            <Field
              key={type}
              def={{
                name: `next_numbers.${type}`,
                label: `Next ${DOCUMENT_LABELS[type].toLowerCase()} number`,
                type: 'number',
                hint: values.highest_numbers[type]
                  ? `Last issued: ${values.highest_numbers[type]}`
                  : 'None issued yet.',
              }}
              value={values.next_numbers[type]}
              error={errors[`next_numbers.${type}`]}
              onChange={(value) =>
                setValues({
                  ...values,
                  next_numbers: { ...values.next_numbers, [type]: Number(value) || 1 },
                })
              }
            />
          ))}
        </div>

        <h2>Terms and conditions</h2>
        <p className="muted">One term per line. Printed, numbered, on new documents.</p>
        <Field
          def={{ name: 'terms_general', label: 'Invoices and order forms', type: 'textarea' }}
          value={values.terms_general}
          error={errors.terms_general}
          onChange={(value) => setValues({ ...values, terms_general: asText(value) })}
        />
        <Field
          def={{ name: 'terms_proforma', label: 'Proforma invoices', type: 'textarea' }}
          value={values.terms_proforma}
          error={errors.terms_proforma}
          onChange={(value) => setValues({ ...values, terms_proforma: asText(value) })}
        />
        <p>
          <button className="btn" type="submit">
            Save document settings
          </button>
        </p>
      </form>
    </>
  );
}
