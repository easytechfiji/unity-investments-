-- TEST FIXTURES FOR THE AUTOMATED TESTS ONLY. Never load into staging or production.
--
-- Delivery regions, shop details, FAQs and a page with made up values, so the
-- tests can exercise delivery charges, bank transfer details and content pages.
-- The real values are entered by the shop in the admin. Loaded after sample-data.sql.
-- Safe to run twice.

-- Delivery regions in Fiji. Placeholder prices in FJD.
insert into public.shipping_regions (region_name, description, price, sort_order) values
  ('Suva and Lami', 'Sample region. Delivery within Suva city and Lami.', 10.00, 1),
  ('Nasinu', 'Sample region.', 12.00, 2),
  ('Nausori', 'Sample region.', 15.00, 3),
  ('Navua', 'Sample region.', 20.00, 4),
  ('Sigatoka', 'Sample region.', 30.00, 5),
  ('Nadi', 'Sample region.', 35.00, 6),
  ('Lautoka', 'Sample region.', 35.00, 7),
  ('Ba', 'Sample region.', 40.00, 8),
  ('Labasa', 'Sample region. Vanua Levu.', 45.00, 9),
  ('Savusavu', 'Sample region. Vanua Levu.', 45.00, 10)
on conflict (region_name) do nothing;

-- Placeholder shop details. Real values are entered in the admin settings page.
update public.site_settings set
  phone = coalesce(phone, '+679 000 0000'),
  email = coalesce(email, 'shop@example.test'),
  address = coalesce(address, 'Lot 23, Nakasi, Fiji'),
  bank_account_name = coalesce(bank_account_name, 'SAMPLE ACCOUNT NAME'),
  bank_name = coalesce(bank_name, 'Sample Bank'),
  bank_branch_code = coalesce(bank_branch_code, '000-000'),
  bank_account_number = coalesce(bank_account_number, '00000000'),
  paypal_fx_rate = coalesce(paypal_fx_rate, 0.440000)
where id = 1;


insert into public.faqs (question, answer, sort_order)
select * from (values
  ('How do I pay for an order?', 'You can pay by bank transfer or with PayPal. For a bank transfer, use your order number as the payment reference. We start preparing your order once the payment reaches our account.', 1),
  ('Can I collect my order from the shop?', 'Yes. Choose Click And Collect at checkout. There is no delivery charge, and we will contact you when the order is ready.', 2),
  ('Where do you deliver?', 'We deliver to the regions listed on the Delivery page. The delivery cost is shown at checkout before you pay.', 3),
  ('How do I check on my order?', 'Use the Order lookup page with the reference from your confirmation email and the email address you ordered with.', 4)
) as f (question, answer, sort_order)
where not exists (select 1 from public.faqs existing where existing.question = f.question);

insert into public.pages (kind, name, slug, body) values
  ('about', 'About us', 'about-us', '<p>Sample page. The shop owner will write this text in the admin before launch.</p>')
on conflict (kind) do nothing;
