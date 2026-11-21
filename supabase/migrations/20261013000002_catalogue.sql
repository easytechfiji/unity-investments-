-- Catalogue: categories, subcategories, attributes, products, variants, images.
-- legacy_id columns are kept for old ids if old data ever turns up. They are empty for now.

create table public.categories (
  id bigint generated always as identity primary key,
  legacy_id bigint unique,
  name text not null check (length(name) between 1 and 200),
  slug public.slug not null unique,
  description text,
  image text,                       -- Storage path
  popular boolean not null default false,
  status boolean not null default true,
  sort_order int not null default 0,
  meta_title text,
  meta_description text,
  meta_keywords text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.subcategories (
  id bigint generated always as identity primary key,
  legacy_id bigint unique,
  category_id bigint not null references public.categories (id),
  name text not null check (length(name) between 1 and 200),
  slug public.slug not null unique,
  description text,
  image text,
  popular boolean not null default false,
  status boolean not null default true,
  sort_order int not null default 0,
  meta_title text,
  meta_description text,
  meta_keywords text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- Lets products check that their subcategory belongs to their category.
  unique (id, category_id)
);
create index subcategories_category_id_idx on public.subcategories (category_id);

-- Attribute groups. `code` is how the code finds Size and Colour, instead of magic ids.
create table public.attribute_options (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[a-z_]+$'),
  name text not null,
  description text,
  status boolean not null default true
);

create table public.attribute_values (
  id bigint generated always as identity primary key,
  attribute_id bigint not null references public.attribute_options (id),
  name text not null check (length(name) between 1 and 100),
  description text,
  status boolean not null default true,
  unique (attribute_id, name)
);

create type public.product_type as enum ('simple', 'variable');

create table public.products (
  id bigint generated always as identity primary key,
  legacy_id bigint unique,
  category_id bigint not null references public.categories (id),
  subcategory_id bigint not null,
  type public.product_type not null default 'simple',
  name text not null check (length(name) between 1 and 300),
  slug public.slug not null unique,
  sku text unique,
  small_description text,
  description text,                 -- admin written HTML, sanitised before saving and before display
  buyers_guide text,                -- admin written HTML, same rule
  original_price public.amount not null default 0,
  sale_price public.amount check (sale_price is null or sale_price > 0),  -- null means not on sale
  image text,                       -- main image, Storage path
  color_id bigint references public.attribute_values (id),  -- simple products only
  size_id bigint references public.attribute_values (id),   -- simple products only
  stock int not null default 0 check (stock >= 0),          -- simple products only
  tax numeric(5, 2) not null default 0 check (tax between 0 and 100),
  status boolean not null default true,
  trending boolean not null default false,
  featured boolean not null default false,
  meta_title text,
  meta_description text,
  meta_keywords text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (subcategory_id, category_id) references public.subcategories (id, category_id)
);
create index products_subcategory_id_idx on public.products (subcategory_id);
create index products_category_id_idx on public.products (category_id);

create table public.product_images (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  image text not null,
  sort_order int not null default 0
);
create index product_images_product_id_idx on public.product_images (product_id);

-- Size and colour combinations of a variable product, each with its own price and stock.
create table public.product_variants (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  sku text unique,
  color_id bigint references public.attribute_values (id),
  size_id bigint references public.attribute_values (id),
  price public.amount not null,
  stock int not null default 0 check (stock >= 0),
  check (color_id is not null or size_id is not null),
  unique nulls not distinct (product_id, color_id, size_id)
);
create index product_variants_product_id_idx on public.product_variants (product_id);

create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger subcategories_updated_at before update on public.subcategories
  for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

insert into public.attribute_options (code, name) values ('size', 'Size'), ('colour', 'Colour');
