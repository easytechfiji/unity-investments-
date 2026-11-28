-- Update 02, part 4: documents the admin issues by hand (invoices, official receipts,
-- proforma invoices and order forms), and the parties (customers) they are made out to.
--
-- Issued documents are accounting records. They are never edited or deleted: a mistake
-- is fixed by voiding the document (with a reason) and issuing a new one. Triggers below
-- enforce that, so not even a bug in the API can change an issued document.

-- Business details printed on documents. Bank details stay in this table only, entered
-- in admin Settings, never in code or git.
alter table public.site_settings
  add column legal_name text,
  add column tin text,
  add column bank_swift text,
  add column mpaisa_number text;

-- Saved customers, so the admin can pick one instead of typing the details again.
create table public.parties (
  id bigint generated always as identity primary key,
  name text not null check (length(name) between 1 and 200),
  contact_person text,
  address text,
  country text,
  phone text,
  email text,
  tin text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index parties_name_idx on public.parties (lower(name));
create trigger parties_updated_at before update on public.parties
  for each row execute function public.set_updated_at();

-- The next number for each type of document. Taking a number updates this row inside the
-- same transaction that saves the document, so the row lock makes a second admin wait:
-- two documents can never get the same number, and a failed save gives its number back.
create table public.document_counters (
  type text primary key check (type in ('invoice', 'receipt', 'proforma', 'order')),
  next_number int not null default 1 check (next_number between 1 and 99999999)
);
insert into public.document_counters (type) values ('invoice'), ('receipt'), ('proforma'), ('order');

-- One row of settings for documents, edited by the owner in admin Settings.
create table public.document_settings (
  id smallint primary key default 1 check (id = 1),
  vat_rate numeric(5, 2) not null default 12.5 check (vat_rate between 0 and 100),
  prices_include_vat boolean not null default true,
  terms_general text not null default '',
  terms_proforma text not null default '',
  updated_at timestamptz not null default now()
);
create trigger document_settings_updated_at before update on public.document_settings
  for each row execute function public.set_updated_at();

-- Starting terms, from the paper forms (docs/forms/make_forms.py). One term per line.
insert into public.document_settings (id, terms_general, terms_proforma) values (
  1,
  'All prices are in Fiji Dollars (FJD) and include VAT unless otherwise stated.
Payment is due within 14 days of the invoice date unless otherwise agreed in writing.
Please quote the invoice number as the reference on all payments.
Goods remain the property of Unity Investments & Marketing (Fiji) Pte Ltd until paid in full.
Please check goods on delivery. Any shortages or damage must be reported within 24 hours.
Goods sold are not returnable or refundable unless faulty or supplied incorrectly.
Deposits paid on confirmed orders are non-refundable.',
  'This is a proforma invoice for quotation and import permit purposes only; it is not a demand for payment.
Advance payment or the agreed deposit is required before shipment; any balance is payable as per the payment terms above.
Prices are based on the Incoterm stated above. Bank charges outside Fiji are for the buyer''s account.
Prices, quantities and shipment dates are subject to final confirmation and the validity date shown.
Goods remain the property of Unity Investments & Marketing (Fiji) Pte Ltd until paid in full.
Deposits paid on confirmed orders are non-refundable.
We certify that the particulars given above are true and correct.'
);

create table public.documents (
  id bigint generated always as identity primary key,
  type text not null check (type in ('invoice', 'receipt', 'proforma', 'order')),
  number int not null check (number > 0),
  party_id bigint references public.parties (id) on delete set null,
  -- A copy of the party's details as they were when the document was issued, so editing
  -- the party later does not change old documents.
  party jsonb not null,
  issue_date date not null,
  -- The fields only some types have (PO number, Incoterms, deposit method and so on).
  fields jsonb not null default '{}',
  -- The business details and terms printed on it, as they were when it was issued, so a
  -- void copy can be drawn exactly as the original.
  business jsonb not null default '{}',
  terms jsonb not null default '[]',
  currency text not null default 'FJD' check (currency ~ '^[A-Z]{3}$'),
  vat_rate numeric(5, 2) not null default 0,
  prices_include_vat boolean not null default true,
  -- Money, calculated by the API from the lines (CLAUDE.md rule 1).
  subtotal numeric(12, 2) not null default 0,
  vat numeric(12, 2) not null default 0,
  freight numeric(12, 2) not null default 0,
  insurance numeric(12, 2) not null default 0,
  other_charges numeric(12, 2) not null default 0,
  deposit numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  balance numeric(12, 2) not null default 0,
  -- A receipt can say which invoice it pays.
  invoice_id bigint references public.documents (id),
  status text not null default 'issued' check (status in ('issued', 'void')),
  paid_at timestamptz,
  void_reason text,
  voided_at timestamptz,
  voided_by uuid,
  pdf_path text,
  emailed_at timestamptz,
  emailed_to text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (type, number),
  check (status = 'issued' or (void_reason is not null and voided_at is not null))
);
create index documents_created_at_idx on public.documents (created_at desc);
create index documents_party_id_idx on public.documents (party_id);
create index documents_invoice_id_idx on public.documents (invoice_id);

create table public.document_lines (
  id bigint generated always as identity primary key,
  document_id bigint not null references public.documents (id),
  sort_order int not null,
  description text not null check (length(description) between 1 and 500),
  hs_code text,
  unit text,
  qty numeric(12, 3) not null check (qty > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  amount numeric(12, 2) not null
);
create index document_lines_document_id_idx on public.document_lines (document_id, sort_order);

-- Issued documents and their lines never change. Only these may: voiding (status, reason,
-- when, by whom), being marked paid by a receipt, the stored PDF (replaced by the VOID copy),
-- the email record, and party_id being cleared when a saved party is removed (the copy in
-- party keeps the details).
create function public.protect_issued_document() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'documents are never deleted; void them instead';
  end if;
  if old.status = 'void' and new.status <> 'void' then
    raise exception 'a void document cannot be issued again';
  end if;
  if (new.type, new.number, new.party, new.issue_date, new.fields, new.business, new.terms, new.currency,
      new.vat_rate, new.prices_include_vat, new.subtotal, new.vat, new.freight, new.insurance,
      new.other_charges, new.deposit, new.total, new.balance, new.invoice_id, new.created_by,
      new.created_at)
     is distinct from
     (old.type, old.number, old.party, old.issue_date, old.fields, old.business, old.terms, old.currency,
      old.vat_rate, old.prices_include_vat, old.subtotal, old.vat, old.freight, old.insurance,
      old.other_charges, old.deposit, old.total, old.balance, old.invoice_id, old.created_by,
      old.created_at)
     or (new.party_id is distinct from old.party_id and new.party_id is not null) then
    raise exception 'an issued document cannot be changed; void it and issue a new one';
  end if;
  return new;
end;
$$;

create trigger documents_protect before update or delete on public.documents
  for each row execute function public.protect_issued_document();

create function public.protect_document_lines() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'issued documents and their lines are never changed or deleted';
end;
$$;

create trigger document_lines_protect before update or delete on public.document_lines
  for each row execute function public.protect_document_lines();
create trigger documents_no_truncate before truncate on public.documents
  for each statement execute function public.protect_document_lines();
create trigger document_lines_no_truncate before truncate on public.document_lines
  for each statement execute function public.protect_document_lines();

-- As with the audit log, take the rights away too.
revoke delete, truncate on public.documents, public.document_lines from service_role;

-- Only the API (service role) reaches these tables, as with every other table
-- (20261013000006_lock_down.sql). No policies means no access for browser keys.
alter table public.parties enable row level security;
alter table public.document_counters enable row level security;
alter table public.document_settings enable row level security;
alter table public.documents enable row level security;
alter table public.document_lines enable row level security;
