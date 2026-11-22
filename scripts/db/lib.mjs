// Shared by the migrate script and the integration tests.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';

const root = resolve(import.meta.dirname, '..', '..');
const migrationsDir = join(root, 'supabase', 'migrations');

/** Creates (or with fresh, drops and recreates) a database on a server we control. */
export async function prepareDatabase(adminUrl, name, fresh) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name))
    throw new Error('Database name must be lowercase letters, digits and underscores.');
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const exists = await admin.query('select 1 from pg_database where datname = $1', [name]);
    if (fresh && exists.rowCount) await admin.query(`drop database ${name} with (force)`);
    if (fresh || !exists.rowCount) await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }
}

/**
 * Applies every migration not yet recorded, in order, each in its own
 * transaction. With supabaseLike, first creates the roles and schemas Supabase
 * provides (only for plain Postgres, never for Supabase itself).
 */
export async function migrate(url, { supabaseLike = false, log = () => {} } = {}) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    if (supabaseLike)
      await client.query(readFileSync(join(root, 'scripts', 'db', 'supabase-like.sql'), 'utf8'));
    await client.query(`
      create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (
        version text primary key,
        statements text[],
        name text
      );`);
    const applied = new Set(
      (await client.query('select version from supabase_migrations.schema_migrations')).rows.map(
        (row) => row.version,
      ),
    );
    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();
    let count = 0;
    for (const file of files) {
      const [version, ...rest] = file.replace(/\.sql$/, '').split('_');
      if (applied.has(version)) continue;
      await client.query('begin');
      try {
        await client.query(readFileSync(join(migrationsDir, file), 'utf8'));
        await client.query(
          'insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)',
          [version, rest.join('_')],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw new Error(`Migration ${file} failed: ${error.message}`, { cause: error });
      }
      log(`Applied ${file}`);
      count += 1;
    }
    return count;
  } finally {
    await client.end();
  }
}

/** Made up delivery regions, shop details and FAQs for the automated tests only. */
export function loadTestFixtures(url) {
  return runSql(url, readFileSync(join(root, 'supabase', 'seed', 'test-fixtures.sql'), 'utf8'));
}

export function loadSampleData(url) {
  return runSql(url, readFileSync(join(root, 'supabase', 'seed', 'sample-data.sql'), 'utf8'));
}

async function runSql(url, sql) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}
