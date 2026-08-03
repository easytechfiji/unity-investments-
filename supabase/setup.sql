-- ============================================================
-- Unity Investment — full Supabase setup
--
-- HOW TO USE: Supabase dashboard → SQL Editor → New query →
-- paste this ENTIRE file → Run. That's it.
--
-- Safe to run more than once — it won't duplicate anything.
-- ============================================================


-- ------------------------------------------------------------
-- 1. TABLES
-- ------------------------------------------------------------

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  sort_order integer default 0,
  cover_image_url text,
  created_at timestamptz default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category_id uuid references categories(id),
  price numeric(10, 2),
  image_path text,
  image_url text,
  tags text[] default '{}',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- If the tables already existed from an earlier attempt, make sure
-- every column the site uses is present.
alter table categories add column if not exists sort_order integer default 0;
alter table categories add column if not exists cover_image_url text;
alter table items add column if not exists price numeric(10, 2);
alter table items add column if not exists image_path text;
alter table items add column if not exists image_url text;
alter table items add column if not exists tags text[] default '{}';
alter table items add column if not exists is_active boolean default true;
alter table items add column if not exists updated_at timestamptz default now();

-- Keep updated_at fresh automatically whenever you edit an item.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists items_set_updated_at on items;
create trigger items_set_updated_at
  before update on items
  for each row execute function set_updated_at();

-- Indexes so browsing and search stay fast as the catalogue grows.
create index if not exists items_category_id_idx on items (category_id);
create index if not exists items_is_active_created_idx on items (is_active, created_at desc);


-- ------------------------------------------------------------
-- 2. SECURITY (Row Level Security)
--
-- Visitors can only READ. Nobody can create, edit or delete
-- anything from the website — only you, through the Supabase
-- dashboard.
-- ------------------------------------------------------------

alter table items enable row level security;
alter table categories enable row level security;

drop policy if exists "Public read published items" on items;
create policy "Public read published items"
  on items for select
  using (is_active = true);

drop policy if exists "Public read categories" on categories;
create policy "Public read categories"
  on categories for select
  using (true);

-- No insert/update/delete policies on purpose: with RLS enabled and
-- no write policy, all public writes are rejected automatically.


-- ------------------------------------------------------------
-- 3. STORAGE BUCKET (product images)
--
-- Creates a public bucket called "item-images". Anyone can VIEW
-- images (needed to show them on the site), only you can upload —
-- you'll do uploads through the dashboard: Storage → item-images.
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', true)
on conflict (id) do nothing;

drop policy if exists "Public read item images" on storage.objects;
create policy "Public read item images"
  on storage.objects for select
  using (bucket_id = 'item-images');


-- ------------------------------------------------------------
-- 4. YOUR SIX CATEGORIES
--
-- Don't change the slugs — the category images on the site are
-- named after them (e.g. /catalogue/vehicles.png).
-- ------------------------------------------------------------

insert into categories (name, slug, description, sort_order) values
  ('Vehicles', 'vehicles', 'Cars, vans and transport options sourced from different retailers.', 1),
  ('Blankets & Bedding', 'blankets-bedding', 'Blankets, bedding and soft home essentials.', 2),
  ('Electronics', 'electronics', 'Useful tech, entertainment devices and electronic accessories.', 3),
  ('Home Goods', 'home-goods', 'Practical household products for daily living and comfort.', 4),
  ('Phones & Tablets', 'phones-tablets', 'Mobile phones, tablets and everyday smart devices.', 5),
  ('Daily Essentials', 'daily-essentials', 'Everyday products that customers need often and can browse quickly.', 6)
on conflict (slug) do nothing;


-- ------------------------------------------------------------
-- 5. (OPTIONAL) EXAMPLE PRODUCT — uncomment to test the site
-- before you've uploaded real products. Delete the row later
-- from Table Editor → items.
-- ------------------------------------------------------------

-- insert into items (name, description, price, category_id, is_active)
-- select 'Test Product', 'A sample item to check the site works.', 99.99, id, true
-- from categories where slug = 'electronics';


-- Done! Next: upload product photos in Storage → item-images,
-- then add rows in Table Editor → items with the image path.
