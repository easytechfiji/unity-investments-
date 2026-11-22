// Backups, separate from Supabase's own (Appendix B section 2.6).
//
//   node scripts/db/backup.mjs dump [--url <connection string>] [--out <folder>]
//       Writes a compressed pg_dump file. Without --url it backs up the local
//       database; with SUPABASE_DB_URL in the root .env, `npm run db:backup`
//       backs up production. Keep the weekly file somewhere other than Supabase.
//
//   node scripts/db/backup.mjs restore-test <dump file>
//       Restores the file into a scratch local database (od_restore_test) and
//       checks that every table has the same number of rows as the source.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { prepareDatabase } from './lib.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const LOCAL_ADMIN = 'postgres://postgres:postgres@localhost:54322/postgres';
const LOCAL_DB = 'postgres://postgres:postgres@localhost:54322/od';
const exe = process.platform === 'win32' ? '.exe' : '';
const binDir =
  process.env.PG_BIN ??
  join(
    process.env.LOCALAPPDATA ?? join(process.env.HOME ?? '', '.local'),
    'od-tools',
    'pgsql',
    'bin',
  );

function bin(name) {
  const path = join(binDir, name + exe);
  return existsSync(path) ? path : name; // fall back to PATH (CI, Linux)
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Row counts of every table in the public schema, plus admin users. */
async function counts(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const tables = (
      await client.query(
        `select tablename from pg_tables where schemaname = 'public' order by tablename`,
      )
    ).rows;
    const result = {};
    for (const { tablename } of tables) {
      result[tablename] = Number(
        (await client.query(`select count(*) from public."${tablename}"`)).rows[0].count,
      );
    }
    return result;
  } finally {
    await client.end();
  }
}

const command = process.argv[2];

if (command === 'dump') {
  const url = arg('--url') ?? process.env.SUPABASE_DB_URL ?? LOCAL_DB;
  const out = resolve(arg('--out') ?? join(root, '.data', 'backups'));
  mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(out, `od-${stamp}.dump`);
  const usersFile = join(out, `od-${stamp}-auth-users.dump`);
  // Custom format: compressed, and pg_restore can pick tables out of it.
  execFileSync(
    bin('pg_dump'),
    [
      '--format=custom',
      '--no-owner',
      '--schema=public',
      '--schema=supabase_migrations',
      '--file',
      file,
      url,
    ],
    { stdio: 'inherit' },
  );
  // Admin accounts live in Supabase's auth.users. Admin profiles point at them, so
  // a backup without them could not restore admin access. Data only: the table
  // itself belongs to Supabase.
  execFileSync(
    bin('pg_dump'),
    ['--format=custom', '--data-only', '--table=auth.users', '--file', usersFile, url],
    { stdio: 'inherit' },
  );
  console.log(`Backup written to ${file}
Admin accounts written to ${usersFile}`);
} else if (command === 'restore-test') {
  const file = process.argv[3];
  if (!file || !existsSync(file)) {
    console.error('Give the dump file to test.');
    process.exit(1);
  }
  const source = arg('--source') ?? LOCAL_DB;
  const target = LOCAL_ADMIN.replace(/\/postgres$/, '/od_restore_test');
  await prepareDatabase(LOCAL_ADMIN, 'od_restore_test', true);
  // The roles and schemas Supabase provides must exist before restoring into plain Postgres.
  const client = new pg.Client({ connectionString: target });
  await client.connect();
  const { readFileSync } = await import('node:fs');
  await client.query(readFileSync(join(root, 'scripts', 'db', 'supabase-like.sql'), 'utf8'));
  await client.query(
    'create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions;',
  );
  // The dump creates the public schema itself, so start without one, as a new project would.
  await client.query('drop schema public cascade;');
  await client.end();
  // Admin accounts first, then the shop data that refers to them.
  const usersFile = file.replace(/.dump$/, '-auth-users.dump');
  if (existsSync(usersFile)) {
    execFileSync(
      bin('pg_restore'),
      ['--data-only', '--exit-on-error', '--dbname', target, usersFile],
      { stdio: 'inherit' },
    );
  }
  execFileSync(bin('pg_restore'), ['--no-owner', '--exit-on-error', '--dbname', target, file], {
    stdio: 'inherit',
  });

  const [before, after] = await Promise.all([counts(source), counts(target)]);
  const tables = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  let ok = true;
  for (const table of tables) {
    const same = before[table] === after[table];
    if (!same) ok = false;
    console.log(
      `${same ? 'same' : 'DIFFERENT'}  ${table}: source ${before[table] ?? 'missing'}, restored ${after[table] ?? 'missing'}`,
    );
  }
  console.log(ok ? 'Restore test passed: every table matches.' : 'Restore test FAILED.');
  process.exit(ok ? 0 : 1);
} else {
  console.error(
    'Usage: node scripts/db/backup.mjs dump [--url <url>] [--out <folder>] | restore-test <file>',
  );
  process.exit(1);
}
