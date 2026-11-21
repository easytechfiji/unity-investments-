-- Orders. Customer details live on the order only; there are no guest accounts.
-- Names, prices and region are copied at order time so later catalogue edits
-- never change an old order.

create type public.delivery_method as enum ('click_and_collect', 'shipping');
create type public.payment_method as enum ('paypal', 'bank_transfer');
create type public.payment_state as enum ('awaiting', 'paid', 'failed', 'refunded');
create type public.order_state as enum ('pending', 'processing', 'completed', 'cancelled');

-- Short human order numbers (OD-100001, OD-100002, ...) that never repeat.
create sequence public.order_number_seq start with 100001;

create table public.orders (
  id bigint generated always as identity primary key,
  legacy_id bigint unique,
  -- Long random reference for customer order lookup. 128 bits, cannot be guessed or counted.
  public_ref text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  order_number text not null unique default 'OD-' || nextval('public.order_number_seq'),
  -- Sent by the checkout page once per attempt, so a double click cannot create two orders.
  checkout_token uuid unique,
  email text not null,
  first_name text not null,
  last_name text,
  phone text not null,
  -- Fiji addresses: street, town or city, division. Fiji has no postcodes.
  street_number text,
  street_name text,
  city text,
  state text,                       -- division: Central, Western, Northern or Eastern
  country text not null default 'Fiji',
  postcode text,
  ship_to_different_address boolean not null default false,
  ship_first_name text,
  ship_last_name text,
  ship_phone text,
  ship_street_number text,
  ship_street_name text,
  ship_city text,
  ship_state text,
  ship_country text,
  ship_postcode text,
  delivery_method public.delivery_method not null,
  shipping_region text,
  shipping_cost public.amount not null default 0,
  subtotal public.amount not null,
  tax_total public.amount not null default 0,
  total public.amount not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),     -- price currency, FJD
  -- What PayPal actually charged, when it charges a different currency.
  charge_currency char(3) check (charge_currency ~ '^[A-Z]{3}$'),
  charge_amount public.amount,
  fx_rate numeric(12, 6) check (fx_rate > 0),
  payment_method public.payment_method not null,
  payment_state public.payment_state not null default 'awaiting',
  paypal_order_id text unique,
  payment_reference text unique,    -- PayPal capture id. Unique, so one capture can never pay two orders.
  paid_at timestamptz,
  order_state public.order_state not null default 'pending',
  -- True while this order holds stock. Lets a cancel give the stock back exactly once.
  stock_reserved boolean not null default false,
  customer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (total = subtotal + shipping_cost + tax_total),
  check (delivery_method = 'click_and_collect' or shipping_region is not null),
  check (delivery_method = 'shipping' or shipping_cost = 0),
  check ((charge_currency is null) = (charge_amount is null) and (charge_amount is null) = (fx_rate is null))
);
create index orders_email_idx on public.orders (lower(email));
create index orders_created_at_idx on public.orders (created_at desc);

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders (id) on delete cascade,
  product_id bigint references public.products (id) on delete set null,
  variant_id bigint references public.product_variants (id) on delete set null,
  name text not null,
  sku text,
  color text,
  size text,
  unit_price public.amount not null,
  quantity int not null check (quantity between 1 and 999)
);
create index order_items_order_id_idx on public.order_items (order_id);

-- PayPal webhook events already handled. A repeated event id is ignored.
create table public.payment_events (
  event_id text primary key,
  event_type text not null,
  order_id bigint references public.orders (id),
  received_at timestamptz not null default now()
);

create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
