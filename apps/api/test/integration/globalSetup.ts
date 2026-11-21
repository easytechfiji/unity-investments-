// Builds a fresh test database (od_test) from the migrations once per test run.
// Needs a Postgres server: locally `npm run db:start`, in CI a service container.
import { migrate, prepareDatabase } from '../../../../scripts/db/lib.mjs';

export const TEST_ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:54322/postgres';

export function testDatabaseUrl(): string {
  const url = new URL(TEST_ADMIN_URL);
  url.pathname = '/od_test';
  return url.toString();
}

export default async function setup(): Promise<void> {
  try {
    await prepareDatabase(TEST_ADMIN_URL, 'od_test', true);
  } catch (error) {
    throw new Error(
      `Integration tests need Postgres at ${new URL(TEST_ADMIN_URL).host}. Start it with "npm run db:start". (${(error as Error).message})`,
      { cause: error },
    );
  }
  await migrate(testDatabaseUrl(), { supabaseLike: true });
}
