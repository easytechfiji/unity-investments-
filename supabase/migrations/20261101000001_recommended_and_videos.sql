-- Update 01: a "Recommended" product order and product videos.
--
-- spotlight: the owner can pin a product to the home page display section and
-- to the top of the Recommended order.
-- sort_rank: a manual rank number the owner sets. Lower shows first. The
-- default 1000 means "no particular rank", so new products sort after ranked ones.
-- product_videos: short promotional clips, each with a poster image and a
-- plain text transcript (also the accessibility alternative for people who
-- cannot play the video).

alter table public.products
  add column spotlight boolean not null default false,
  add column sort_rank int not null default 1000,
  -- Optional fixed list of sizes an enquiry form should ask the visitor to
  -- choose from, for a "Request a quote" product that comes in many sizes.
  add column quote_size_options text[];

create index products_recommended_idx
  on public.products (spotlight desc, trending desc, sort_rank, name, id)
  where status and deleted_at is null;

create table public.product_videos (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  storage_path text not null,
  poster_path text not null,
  title text not null,
  description text,
  aspect text not null check (aspect in ('1x1', '4x5', '9x16', '16x9')),
  duration_seconds int not null check (duration_seconds > 0),
  transcript text,
  sort_order int not null default 0,
  status boolean not null default true,
  created_at timestamptz not null default now(),
  unique (product_id, storage_path)
);
create index product_videos_product_id_idx on public.product_videos (product_id);

alter table public.product_videos enable row level security;

-- public_products gains spotlight and sort_rank at the end of its column list,
-- which is the only way Postgres allows adding to a view in place.
create or replace view public.public_products with (security_invoker = false) as
select p.id, p.slug, p.name, p.sku, p.type, p.small_description, p.description, p.buyers_guide,
       p.original_price,
       case when ss.active and ss.ends_at > now() then p.sale_price end as sale_price,
       case when p.type = 'variable' then v.price_min end as price_min,
       case when p.type = 'variable' then v.price_max end as price_max,
       case when p.type = 'variable' then coalesce(v.stock_total, 0) else p.stock end as stock,
       p.image, p.trending, p.featured,
       c.id as category_id, c.slug as category_slug, c.name as category_name,
       s.id as subcategory_id, s.slug as subcategory_slug, s.name as subcategory_name,
       p.meta_title, p.meta_description, p.created_at, p.updated_at,
       p.spotlight, p.sort_rank, p.quote_size_options
from public.products p
join public.categories c on c.id = p.category_id and c.status and c.deleted_at is null
join public.subcategories s on s.id = p.subcategory_id and s.status and s.deleted_at is null
left join public.sale_settings ss on ss.id = 1
left join lateral (
  select min(pv.price) as price_min, max(pv.price) as price_max, sum(pv.stock)::int as stock_total
  from public.product_variants pv
  where pv.product_id = p.id
) v on true
where p.status and p.deleted_at is null;

create view public.public_product_videos with (security_invoker = false) as
select v.id, v.product_id, v.storage_path, v.poster_path, v.title, v.description, v.aspect,
       v.duration_seconds, v.transcript, v.sort_order, v.created_at
from public.product_videos v
join public.public_products pp on pp.id = v.product_id
where v.status;

grant select on public.public_product_videos to anon, authenticated;
