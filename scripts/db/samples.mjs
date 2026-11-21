// Loads or removes the sample catalogue (supabase/seed/sample-data.sql).
//
//   node scripts/db/samples.mjs load --local                 local dev database "od"
//   node scripts/db/samples.mjs load --url <staging url> --i-understand-this-is-not-production
//   node scripts/db/samples.mjs remove --url <url>           delete every sample row
//
// Sample data must never reach production, so loading into anything other than
// the local database needs an explicit flag.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';

const root = resolve(import.meta.dirname, '..', '..');

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const command = process.argv[2];
const local = process.argv.includes('--local');
const database = arg('--database') ?? 'od';
const url = local ? `postgres://postgres:postgres@localhost:54322/${database}` : arg('--url');

if (!url || !['load', 'remove'].includes(command)) {
  console.error(
    'Usage: node scripts/db/samples.mjs load|remove --local | --url <connection string>',
  );
  process.exit(1);
}
if (
  command === 'load' &&
  !local &&
  !process.argv.includes('--i-understand-this-is-not-production')
) {
  console.error(
    'Refusing to load sample data into a non-local database without --i-understand-this-is-not-production.',
  );
  process.exit(1);
}

// Removes sample rows in an order that respects foreign keys. Orders that used
// sample products keep their copied names and prices; only the link is cleared.
const REMOVE_SQL = `
  begin;
  update public.order_items set product_id = null, variant_id = null
    where product_id in (select id from public.products where sku like 'SAMPLE-%');
  delete from public.product_variants where sku like 'SAMPLE-%';
  delete from public.products where sku like 'SAMPLE-%';
  delete from public.subcategories s where s.slug in (
    'paper-and-notebooks', 'pens-and-markers', 'filing-and-storage', 'office-chairs-range',
    'desks-and-counters', 'magnetic-whiteboards', 'whiteboard-accessories', 'safety-tape',
    'cones-and-barriers', 'safety-signs', 'exercise-books', 'art-and-craft')
    and not exists (select 1 from public.products p where p.subcategory_id = s.id);
  delete from public.categories c where c.slug in (
    'office-stationery', 'office-furniture', 'whiteboards', 'road-safety', 'school-supplies')
    and not exists (select 1 from public.subcategories s where s.category_id = c.id);
  delete from public.shipping_regions where description like 'Sample region.%';
  delete from public.pages where body like '<p>Sample page.%';
  update public.site_settings set
    phone = nullif(phone, '+679 000 0000'),
    email = nullif(email, 'shop@example.test'),
    bank_account_name = nullif(bank_account_name, 'SAMPLE ACCOUNT NAME'),
    bank_name = nullif(bank_name, 'Sample Bank'),
    bank_branch_code = nullif(bank_branch_code, '000-000'),
    bank_account_number = nullif(bank_account_number, '00000000')
  where id = 1;
  commit;
`;

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  if (command === 'load') {
    await client.query(readFileSync(join(root, 'supabase', 'seed', 'sample-data.sql'), 'utf8'));
    const { rows } = await client.query(
      `select count(*)::int as n from public.products where sku like 'SAMPLE-%'`,
    );
    console.log(`Sample data loaded. ${rows[0].n} sample products.`);
  } else {
    await client.query(REMOVE_SQL);
    console.log('Sample data removed.');
  }
} finally {
  await client.end();
}
