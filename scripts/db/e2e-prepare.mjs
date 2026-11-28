// Builds a fresh database for the browser tests (od_e2e): migrations plus the
// sample catalogue and the test fixtures. Called by apps/web/playwright.config.ts before the API starts.
import pg from 'pg';
import { loadSampleData, loadTestFixtures, migrate, prepareDatabase } from './lib.mjs';

const adminUrl =
  process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:54322/postgres';
const url = new URL(adminUrl);
url.pathname = '/od_e2e';

await prepareDatabase(adminUrl, 'od_e2e', true);
await migrate(url.toString(), { supabaseLike: true });
await loadSampleData(url.toString());
await loadTestFixtures(url.toString());

// One product that has not arrived yet, for the arriving soon test in shop.spec.ts.
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
await client.query(
  "update public.products set availability = 'arriving_soon' where slug = 'wet-floor-sign'",
);
await client.end();
console.log('od_e2e database ready');
