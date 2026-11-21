-- Site content and settings edited from the admin.

create table public.banners (
  id bigint generated always as identity primary key,
  name text,
  description text,
  image text,
  link text,
  status boolean not null default true,
  sort_order int not null default 0
);

create table public.pages (
  id bigint generated always as identity primary key,
  kind text not null unique check (kind in ('about', 'delivery', 'privacy', 'terms')),
  name text not null,
  slug public.slug not null unique,
  body text,                        -- admin written HTML, sanitised
  image text,
  status boolean not null default true,
  meta_title text,
  meta_description text,
  updated_at timestamptz not null default now()
);

create table public.faqs (
  id bigint generated always as identity primary key,
  question text not null,
  answer text not null,
  status boolean not null default true,
  sort_order int not null default 0
);

-- Only shown once the owner confirms each one is real and has permission.
create table public.testimonials (
  id bigint generated always as identity primary key,
  name text not null,
  body text not null,
  status boolean not null default false
);

-- The global sale switch. One row.
create table public.sale_settings (
  id smallint primary key default 1 check (id = 1),
  ends_at timestamptz,
  active boolean not null default false
);

create table public.shipping_regions (
  id bigint generated always as identity primary key,
  region_name text not null unique,
  description text,
  price public.amount not null default 0,
  status boolean not null default true,
  sort_order int not null default 0
);

-- Old or renamed addresses that should send visitors (and Google) somewhere else.
create table public.redirects (
  id bigint generated always as identity primary key,
  from_path text not null unique check (from_path ~ '^/[^?#]*$'),
  to_path text not null check (to_path ~ '^/[^#]*$'),
  created_at timestamptz not null default now(),
  check (from_path <> to_path)
);

-- One row. Bank details are admin editable and never appear in a public view.
create table public.site_settings (
  id smallint primary key default 1 check (id = 1),
  site_name text not null,
  phone text,
  phone_2 text,
  email text,                       -- shop inbox for orders and enquiries
  address text,
  opening_hours text,
  website_url text,
  facebook_url text,
  instagram_url text,
  whatsapp text,
  logo text,
  bank_account_name text,
  bank_name text,
  bank_branch_code text,
  bank_account_number text,
  -- How many units of the PayPal currency one Fijian dollar buys. PayPal cannot
  -- charge FJD, so checkout converts at this rate. PayPal is hidden while it is empty.
  paypal_fx_rate numeric(12, 6) check (paypal_fx_rate > 0),
  updated_at timestamptz not null default now()
);

create trigger pages_updated_at before update on public.pages
  for each row execute function public.set_updated_at();
create trigger site_settings_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

-- Required rows. The old site crashed when the settings row was missing.
-- Starting contact details. The owner edits these in admin Settings.
insert into public.site_settings (id, site_name, phone, email, address, website_url, whatsapp)
values (1, 'Unity Investment', '+679 992 4441', 'unityfiji.info@gmail.com', 'Lot 23, Nakasi, Fiji',
        'https://unityfj.com', '+679 992 4441');
insert into public.sale_settings (id, active) values (1, false);
