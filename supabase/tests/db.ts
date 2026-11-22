import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

// Roles, schemas and default grants that Supabase provides. Shared with the local database scripts.
const SUPABASE_LIKE_SETUP = readFileSync(
  join(import.meta.dirname, '..', '..', 'scripts', 'db', 'supabase-like.sql'),
  'utf8',
);

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

/** A fresh in-memory Postgres with every migration applied, in order. */
export async function migratedDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_LIKE_SETUP);
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${String(error)}`, { cause: error });
    }
  }
  return db;
}

export type DbRole = 'anon' | 'authenticated' | 'service_role';

/**
 * Runs queries as one of the Supabase roles, the way a request with that key
 * would. The transaction is always rolled back, so tests cannot affect each other.
 */
export async function asRole<T>(
  db: PGlite,
  role: DbRole,
  work: (db: PGlite) => Promise<T>,
): Promise<T> {
  // PGlite is a single connection, so a plain begin and rollback wraps everything in `work`.
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    return await work(db);
  } finally {
    await db.exec('rollback');
  }
}
