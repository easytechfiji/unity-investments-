import pg from 'pg';

// Postgres returns bigint (ids, counts) as strings because they can exceed
// JavaScript's safe integer range. Our ids never will, so read them as numbers.
// numeric (money) stays a string on purpose: see packages/shared/src/money.ts.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

export type Client = pg.PoolClient;
export type Row = Record<string, unknown>;

export interface Db {
  /** One parameterised query. Never build SQL by joining strings with user input. */
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs `work` in a transaction: everything commits together or nothing does. */
  tx<T>(work: (client: Client) => Promise<T>): Promise<T>;
  /**
   * Runs `work` as the database's anon role, the same rights as the public
   * Supabase key. Public endpoints use this, so even a bug in one of them
   * cannot read orders, settings or anything outside the public_* views.
   */
  asAnon<T>(work: (client: Client) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createDb(connectionString: string, max = 10): Db {
  const pool = new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Stop runaway queries instead of letting them hold a connection forever.
    statement_timeout: 15_000,
  });

  async function tx<T>(work: (client: Client) => Promise<T>, role?: 'anon'): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      if (role) await client.query(`set local role ${role}`);
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    async query<T extends Row>(sql: string, params: unknown[] = []) {
      const result = await pool.query<T>(sql, params);
      return result.rows;
    },
    tx: (work) => tx(work),
    asAnon: (work) => tx(work, 'anon'),
    close: () => pool.end(),
  };
}

/** Typed helper for a query on a transaction client. */
export async function rows<T extends Row>(
  client: Client,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await client.query<T>(sql, params)).rows;
}
