-- Row Level Security on every table, with no policies. No policy means no access
-- for the anon and authenticated roles (the browser keys). The API uses the
-- service_role key, which bypasses RLS, and the public site reads only the
-- public_* views created in the next migration.
--
-- Every new table in a later migration must also be added here (a test checks this).

alter table public.categories enable row level security;
alter table public.subcategories enable row level security;
alter table public.attribute_options enable row level security;
alter table public.attribute_values enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.banners enable row level security;
alter table public.pages enable row level security;
alter table public.faqs enable row level security;
alter table public.testimonials enable row level security;
alter table public.sale_settings enable row level security;
alter table public.shipping_regions enable row level security;
alter table public.redirects enable row level security;
alter table public.site_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_events enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.admin_audit_log enable row level security;

-- Second layer: Supabase grants the browser roles full table rights by default.
-- Take them all away, so even a table with RLS switched off by mistake stays closed.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- And for anything created by later migrations.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- The audit log is insert only, even for the API.
revoke update, delete, truncate on public.admin_audit_log from service_role;
