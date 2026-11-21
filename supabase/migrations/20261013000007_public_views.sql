-- The only things the public (anon) key can read.
--
-- These views run with the rights of their owner (security_invoker = false), so
-- they can see the locked tables. They expose only published rows and safe
-- columns. Supabase's linter warns about "security definer views"; here that is
-- intended, because the views are the filter.

create view public.public_categories with (security_invoker = false) as
select c.id, c.name, c.slug, c.description, c.image, c.popular, c.sort_order,
       c.meta_title, c.meta_description, c.updated_at
from public.categories c
where c.status and c.deleted_at is null;

create view public.public_subcategories with (security_invoker = false) as
select s.id, s.name, s.slug, s.description, s.image, s.popular, s.sort_order,
       s.meta_title, s.meta_description, s.updated_at,
       c.id as category_id, c.slug as category_slug, c.name as category_name
from public.subcategories s
join public.categories c on c.id = s.category_id and c.status and c.deleted_at is null
where s.status and s.deleted_at is null;

-- Sale price is only shown while the global sale is on and its end date is in the future.
-- Variable products get a price range and total stock from their variants.
create view public.public_products with (security_invoker = false) as
select p.id, p.slug, p.name, p.sku, p.type, p.small_description, p.description, p.buyers_guide,
       p.original_price,
       case when ss.active and ss.ends_at > now() then p.sale_price end as sale_price,
       case when p.type = 'variable' then v.price_min end as price_min,
       case when p.type = 'variable' then v.price_max end as price_max,
       case when p.type = 'variable' then coalesce(v.stock_total, 0) else p.stock end as stock,
       p.image, p.trending, p.featured,
       c.id as category_id, c.slug as category_slug, c.name as category_name,
       s.id as subcategory_id, s.slug as subcategory_slug, s.name as subcategory_name,
       p.meta_title, p.meta_description, p.created_at, p.updated_at
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

create view public.public_product_images with (security_invoker = false) as
select i.id, i.product_id, i.image, i.sort_order
from public.product_images i
join public.public_products pp on pp.id = i.product_id;

create view public.public_product_variants with (security_invoker = false) as
select pv.id, pv.product_id, pv.sku, pv.price, pv.stock,
       pv.color_id, colour.name as color_name,
       pv.size_id, size.name as size_name
from public.product_variants pv
join public.public_products pp on pp.id = pv.product_id and pp.type = 'variable'
left join public.attribute_values colour on colour.id = pv.color_id
left join public.attribute_values size on size.id = pv.size_id;

create view public.public_banners with (security_invoker = false) as
select id, name, description, image, link, sort_order
from public.banners
where status and image is not null;

create view public.public_pages with (security_invoker = false) as
select id, kind, name, slug, body, image, meta_title, meta_description, updated_at
from public.pages
where status;

create view public.public_faqs with (security_invoker = false) as
select id, question, answer, sort_order
from public.faqs
where status;

create view public.public_testimonials with (security_invoker = false) as
select id, name, body
from public.testimonials
where status;

create view public.public_shipping_regions with (security_invoker = false) as
select id, region_name, description, price, sort_order
from public.shipping_regions
where status;

-- Contact details only. Never bank details: those are sent by the API with a bank transfer order.
create view public.public_site_settings with (security_invoker = false) as
select site_name, phone, phone_2, email, address, opening_hours, website_url,
       facebook_url, instagram_url, whatsapp, logo
from public.site_settings
where id = 1;

create view public.public_redirects with (security_invoker = false) as
select from_path, to_path
from public.redirects;

grant select on
  public.public_redirects,
  public.public_categories,
  public.public_subcategories,
  public.public_products,
  public.public_product_images,
  public.public_product_variants,
  public.public_banners,
  public.public_pages,
  public.public_faqs,
  public.public_testimonials,
  public.public_shipping_regions,
  public.public_site_settings
to anon, authenticated;
