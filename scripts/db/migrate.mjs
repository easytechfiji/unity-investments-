// Applies every migration in supabase/migrations that has not run yet, in order,
// each inside its own transaction. Applied files are recorded in
// supabase_migrations.schema_migrations, the same table the Supabase CLI uses.
//
//   node scripts/db/migrate.mjs --url <connection string>
//   node scripts/db/migrate.mjs --local            the local dev database
//   node scripts/db/migrate.mjs --local --fresh    drop and recreate the local database first
//
// --local also creates the roles and schemas that Supabase normally provides.
// --database <name> picks a database other than "od" on the local server.
import { migrate, prepareDatabase } from './lib.mjs';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const local = process.argv.includes('--local');
const fresh = process.argv.includes('--fresh');
const databaseName = arg('--database') ?? 'od';
const localUrl = (database) => `postgres://postgres:postgres@localhost:54322/${database}`;

try {
  let url = arg('--url') ?? process.env.SUPABASE_DB_URL;
  if (local) {
    await prepareDatabase(localUrl('postgres'), databaseName, fresh);
    url = localUrl(databaseName);
  }
  if (!url) {
    console.error('Give --url, --local, or set SUPABASE_DB_URL.');
    process.exit(1);
  }
  const count = await migrate(url, { supabaseLike: local, log: console.log });
  console.log(count ? `${count} migration(s) applied.` : 'Database is up to date.');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
