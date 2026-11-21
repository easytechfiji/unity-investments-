// Creates an admin account. There is no sign up page on purpose; this is the only way in.
//
//   npm run admin:create -- --email owner@example.com --name "Owner Name" --role owner
//
// Uses the settings in apps/api/.env: the Supabase project (SUPABASE_URL and
// SUPABASE_SECRET_KEY) or, locally, the fake auth server (AUTH_URL). Prints a
// generated password once. The person signs in with it and sets up an
// authenticator app on first sign in.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { authUrl, loadConfig } from '../src/config/env.js';

const LOCAL_SERVICE_KEY = 'local-development-service-key';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const email = arg('email')?.toLowerCase();
const name = arg('name');
const role = arg('role') ?? 'staff';
const password = arg('password') ?? randomBytes(18).toString('base64url');

if (!email || !name || !['owner', 'staff'].includes(role)) {
  console.error(
    'Usage: npm run admin:create -- --email <email> --name "<name>" --role owner|staff',
  );
  process.exit(1);
}

const config = loadConfig(process.env);
const base = authUrl(config);
const local = Boolean(config.AUTH_URL);
const key = config.SUPABASE_SECRET_KEY ?? (local ? LOCAL_SERVICE_KEY : undefined);
if (!base || !key || !config.DATABASE_URL) {
  console.error(
    'Set DATABASE_URL and either SUPABASE_URL with SUPABASE_SECRET_KEY, or AUTH_URL for local development.',
  );
  process.exit(1);
}

const response = await fetch(`${base}/admin/users`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, email_confirm: true }),
});
if (!response.ok) {
  console.error(
    `Could not create the user (status ${response.status}). If the email already exists, reset its password in the Supabase dashboard.`,
  );
  process.exit(1);
}
const user = (await response.json()) as { id: string };

const client = new pg.Client({ connectionString: config.DATABASE_URL });
await client.connect();
try {
  // Locally, auth.users is a stand-in table, so add the row Supabase would have.
  if (local)
    await client.query(
      'insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing',
      [user.id, email],
    );
  await client.query(
    `insert into public.admin_profiles (user_id, name, role) values ($1, $2, $3)
     on conflict (user_id) do update set name = excluded.name, role = excluded.role`,
    [user.id, name, role],
  );
} finally {
  await client.end();
}

console.log(`Admin ready: ${email} (${role})`);
if (!arg('password'))
  console.log(`Password (shown once, store it in a password manager): ${password}`);
