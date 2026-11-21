-- SAMPLE DATA FOR DEVELOPMENT AND STAGING ONLY. NEVER LOAD INTO PRODUCTION.
--
-- Placeholder catalogue so the storefront can be built and tested before real
-- products are entered through the admin. Every product SKU starts with SAMPLE-,
-- and `npm run db:remove-samples` deletes all of it. Prices are placeholders in FJD.
-- Safe to run twice.

-- Categories and subcategories
insert into public.categories (name, slug, description, popular, sort_order, meta_title, meta_description) values
  ('Office stationery', 'office-stationery', 'Sample category. Paper, pens, files and everyday desk items.', true, 1, null, null),
  ('Office furniture', 'office-furniture', 'Sample category. Chairs, desks and reception furniture.', true, 2, null, null),
  ('Whiteboards', 'whiteboards', 'Sample category. Magnetic whiteboards and accessories.', true, 3, null, null),
  ('Road safety', 'road-safety', 'Sample category. Barrier tape, cones, posts and safety signs.', true, 4, null, null),
  ('School supplies', 'school-supplies', 'Sample category. Exercise books, pencils and craft items.', false, 5, null, null)
on conflict (slug) do nothing;

insert into public.subcategories (category_id, name, slug, sort_order)
select c.id, s.name, s.slug, s.sort_order
from (values
  ('office-stationery', 'Paper and notebooks', 'paper-and-notebooks', 1),
  ('office-stationery', 'Pens and markers', 'pens-and-markers', 2),
  ('office-stationery', 'Filing and storage', 'filing-and-storage', 3),
  ('office-furniture', 'Office chairs', 'office-chairs-range', 1),
  ('office-furniture', 'Desks and counters', 'desks-and-counters', 2),
  ('whiteboards', 'Magnetic whiteboards', 'magnetic-whiteboards', 1),
  ('whiteboards', 'Whiteboard accessories', 'whiteboard-accessories', 2),
  ('road-safety', 'Safety tape', 'safety-tape', 1),
  ('road-safety', 'Cones and barriers', 'cones-and-barriers', 2),
  ('road-safety', 'Safety signs', 'safety-signs', 3),
  ('school-supplies', 'Exercise books', 'exercise-books', 1),
  ('school-supplies', 'Art and craft', 'art-and-craft', 2)
) as s (category_slug, name, slug, sort_order)
join public.categories c on c.slug = s.category_slug
on conflict (slug) do nothing;

-- Attribute values
insert into public.attribute_values (attribute_id, name)
select o.id, v.name
from (values
  ('size', '1200 mm'), ('size', '1500 mm'),
  ('size', '900 x 600 mm'), ('size', '1200 x 900 mm'), ('size', '1800 x 1200 mm'),
  ('colour', 'Black'), ('colour', 'Grey'), ('colour', 'Yellow'), ('colour', 'White')
) as v (code, name)
join public.attribute_options o on o.code = v.code
on conflict (attribute_id, name) do nothing;

-- Products
insert into public.products (
  category_id, subcategory_id, type, name, slug, sku, small_description, description,
  original_price, sale_price, stock, featured, trending
)
select s.category_id, s.id, p.type::public.product_type, p.name, p.slug, p.sku,
       p.small_description,
       '<p>' || p.small_description || '</p><p>This is a sample product for testing the website. It will be replaced with real products before launch.</p>',
       p.price, p.sale_price, p.stock, p.featured, p.trending
from (values
  ('paper-and-notebooks', 'simple', 'A4 copy paper 80 gsm, 500 sheets', 'a4-copy-paper-80gsm-500-sheets', 'SAMPLE-001', 'White A4 copy paper for printers and copiers.', 14.50, null::numeric, 120, true, true),
  ('paper-and-notebooks', 'simple', 'A4 copy paper, box of 5 reams', 'a4-copy-paper-box-of-5-reams', 'SAMPLE-002', 'Five reams of 80 gsm A4 paper in one carton.', 68.00, 62.00, 30, true, false),
  ('paper-and-notebooks', 'simple', 'Spiral notebook A5, 120 pages', 'spiral-notebook-a5-120-pages', 'SAMPLE-003', 'Ruled A5 notebook with a card cover.', 4.20, null, 0, false, false),
  ('pens-and-markers', 'simple', 'Ballpoint pens, blue, box of 50', 'ballpoint-pens-blue-box-of-50', 'SAMPLE-004', 'Medium point blue ballpoint pens.', 18.90, null, 40, false, true),
  ('pens-and-markers', 'simple', 'Permanent markers, pack of 12', 'permanent-markers-pack-of-12', 'SAMPLE-005', 'Black bullet tip permanent markers.', 22.50, null, 15, false, false),
  ('pens-and-markers', 'simple', 'Whiteboard markers, 4 colours', 'whiteboard-markers-4-colours', 'SAMPLE-006', 'Black, blue, red and green dry erase markers.', 9.80, null, 60, true, false),
  ('filing-and-storage', 'simple', 'Lever arch file A4', 'lever-arch-file-a4', 'SAMPLE-007', 'Board lever arch file with a 70 mm spine.', 7.50, null, 80, false, false),
  ('filing-and-storage', 'simple', 'Document storage box', 'document-storage-box', 'SAMPLE-008', 'Flat packed archive box with a lid.', 6.90, null, 25, false, false),
  ('office-chairs-range', 'variable', 'Ergonomic mesh office chair', 'ergonomic-mesh-office-chair', 'SAMPLE-009', 'Mesh back, adjustable seat height and lumbar support.', 0, null, 0, true, true),
  ('office-chairs-range', 'simple', 'Executive high back chair', 'executive-high-back-chair', 'SAMPLE-010', 'High back chair with padded arms.', 549.00, 499.00, 2, true, false),
  ('desks-and-counters', 'variable', 'Straight office desk', 'straight-office-desk', 'SAMPLE-011', 'Melamine top with a steel frame.', 0, null, 0, true, false),
  ('desks-and-counters', 'simple', 'Reception counter', 'reception-counter', 'SAMPLE-012', 'Made to order. Ask for a quote with your size.', 0, null, 0, false, false),
  ('magnetic-whiteboards', 'variable', 'Magnetic whiteboard with aluminium frame', 'magnetic-whiteboard-aluminium-frame', 'SAMPLE-013', 'Wall mounted magnetic whiteboard with a pen tray.', 0, null, 0, true, true),
  ('whiteboard-accessories', 'simple', 'Whiteboard eraser', 'whiteboard-eraser', 'SAMPLE-014', 'Felt eraser with a plastic handle.', 5.50, null, 70, false, false),
  ('whiteboard-accessories', 'simple', 'Whiteboard cleaning spray 250 ml', 'whiteboard-cleaning-spray-250ml', 'SAMPLE-015', 'Removes ghosting and dried ink.', 11.00, null, 35, false, false),
  ('safety-tape', 'simple', 'Barrier tape, red and white, 100 m', 'barrier-tape-red-white-100m', 'SAMPLE-016', 'Non adhesive tape for marking off work areas.', 24.00, null, 45, true, true),
  ('safety-tape', 'variable', 'Floor marking tape, 50 mm x 33 m', 'floor-marking-tape-50mm-33m', 'SAMPLE-017', 'Adhesive vinyl tape for floors and car parks.', 0, null, 0, false, false),
  ('cones-and-barriers', 'simple', 'Traffic cone 700 mm', 'traffic-cone-700mm', 'SAMPLE-018', 'Orange cone with a reflective collar.', 32.00, null, 50, true, false),
  ('cones-and-barriers', 'simple', 'Retractable barrier post', 'retractable-barrier-post', 'SAMPLE-019', 'Steel post with a 2 m retractable belt.', 145.00, null, 6, false, false),
  ('safety-signs', 'simple', 'Wet floor sign', 'wet-floor-sign', 'SAMPLE-020', 'Folding A frame sign.', 38.00, null, 12, false, false),
  ('exercise-books', 'simple', 'Exercise books 96 pages, pack of 10', 'exercise-books-96-pages-pack-of-10', 'SAMPLE-021', 'Ruled exercise books for school.', 12.50, null, 200, false, true),
  ('art-and-craft', 'simple', 'Coloured pencils, pack of 24', 'coloured-pencils-pack-of-24', 'SAMPLE-022', 'Full length coloured pencils.', 8.90, null, 90, false, false),
  ('art-and-craft', 'simple', 'Glue sticks 21 g, pack of 12', 'glue-sticks-21g-pack-of-12', 'SAMPLE-023', 'Washable glue sticks.', 10.80, null, 3, false, false)
) as p (subcategory_slug, type, name, slug, sku, small_description, price, sale_price, stock, featured, trending)
join public.subcategories s on s.slug = p.subcategory_slug
on conflict (slug) do nothing;

-- Variants of the variable products
insert into public.product_variants (product_id, sku, color_id, size_id, price, stock)
select p.id, v.sku, colour.id, size.id, v.price, v.stock
from (values
  ('ergonomic-mesh-office-chair', 'SAMPLE-009-BLK', 'Black', null, 389.00, 4),
  ('ergonomic-mesh-office-chair', 'SAMPLE-009-GRY', 'Grey', null, 399.00, 0),
  ('straight-office-desk', 'SAMPLE-011-1200', null, '1200 mm', 420.00, 5),
  ('straight-office-desk', 'SAMPLE-011-1500', null, '1500 mm', 495.00, 3),
  ('magnetic-whiteboard-aluminium-frame', 'SAMPLE-013-S', null, '900 x 600 mm', 129.00, 10),
  ('magnetic-whiteboard-aluminium-frame', 'SAMPLE-013-M', null, '1200 x 900 mm', 189.00, 6),
  ('magnetic-whiteboard-aluminium-frame', 'SAMPLE-013-L', null, '1800 x 1200 mm', 299.00, 2),
  ('floor-marking-tape-50mm-33m', 'SAMPLE-017-YEL', 'Yellow', null, 29.00, 20),
  ('floor-marking-tape-50mm-33m', 'SAMPLE-017-WHT', 'White', null, 29.00, 14)
) as v (product_slug, sku, colour_name, size_name, price, stock)
join public.products p on p.slug = v.product_slug
left join public.attribute_values colour
  on colour.name = v.colour_name and colour.attribute_id = (select id from public.attribute_options where code = 'colour')
left join public.attribute_values size
  on size.name = v.size_name and size.attribute_id = (select id from public.attribute_options where code = 'size')
on conflict (sku) do nothing;

-- Sale switched on for a week so sale prices can be seen.
update public.sale_settings set active = true, ends_at = now() + interval '7 days' where id = 1;
