-- Update 02, part 1: whether a product is on the shelf or still on its way.
--
-- in_stock: customers see the real count ("3 left") and can add it to the cart.
-- arriving_soon: no count and no cart; the product page offers "Request quotation".
--
-- Every product that exists when this runs starts as arriving_soon, so nothing
-- becomes buyable until the owner marks it in stock. New products default to
-- in_stock; the admin form always sends a value anyway.

alter table public.products
  add column availability text not null default 'arriving_soon'
    check (availability in ('in_stock', 'arriving_soon'));
alter table public.products alter column availability set default 'in_stock';

-- public_products gains availability at the end of its column list, the only
-- way Postgres allows adding to a view in place.
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
       p.spotlight, p.sort_rank, p.quote_size_options, p.availability
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
