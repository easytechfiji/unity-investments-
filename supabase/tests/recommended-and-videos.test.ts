import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asRole, migratedDb } from './db.js';

let db: PGlite;

const FIXTURES = `
  insert into public.categories (name, slug) values ('Displays and Screens', 'displays-and-screens');
  insert into public.subcategories (category_id, name, slug)
  select id, 'Interactive Displays', 'interactive-displays' from public.categories where slug = 'displays-and-screens';

  insert into public.products (category_id, subcategory_id, name, slug, sku, original_price, spotlight, sort_rank)
  select category_id, id, 'Interactive Smart Board', 'interactive-smart-board', 'OD-DISPLAY-01', 0, true, 1
  from public.subcategories where slug = 'interactive-displays';

  insert into public.products (category_id, subcategory_id, name, slug, sku, original_price, status)
  select category_id, id, 'Hidden board', 'hidden-board', 'OD-DISPLAY-99', 0, false
  from public.subcategories where slug = 'interactive-displays';

  insert into public.product_videos (product_id, storage_path, poster_path, title, aspect, duration_seconds, transcript)
  select id, 'products/2026/' || repeat('a', 32), 'products/2026/' || repeat('b', 32),
         'Smart board demo', '4x5', 24, 'A demo of the board.'
  from public.products where slug = 'interactive-smart-board';

  insert into public.product_videos (product_id, storage_path, poster_path, title, aspect, duration_seconds)
  select id, 'products/2026/' || repeat('c', 32), 'products/2026/' || repeat('d', 32),
         'Hidden video', '4x5', 10
  from public.products where slug = 'hidden-board';

  insert into public.product_videos (product_id, storage_path, poster_path, title, aspect, duration_seconds, status)
  select id, 'products/2026/' || repeat('e', 32), 'products/2026/' || repeat('f', 32),
         'Switched off video', '4x5', 10, false
  from public.products where slug = 'interactive-smart-board';
`;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(FIXTURES);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('spotlight, rank and videos (update 01)', () => {
  it('adds spotlight and sort_rank to the public products view', async () => {
    const result = await asRole(db, 'anon', (tx) =>
      tx.query<{ spotlight: boolean; sort_rank: number }>(
        `select spotlight, sort_rank from public.public_products where slug = 'interactive-smart-board'`,
      ),
    );
    expect(result.rows[0]).toEqual({ spotlight: true, sort_rank: 1 });
  });

  it('only shows a switched on video for a published product', async () => {
    const result = await asRole(db, 'anon', (tx) =>
      tx.query<{ title: string }>(`select title from public.public_product_videos order by title`),
    );
    expect(result.rows.map((row) => row.title)).toEqual(['Smart board demo']);
  });

  it('rejects an unknown aspect ratio', async () => {
    await expect(
      db.exec(`
        insert into public.product_videos (product_id, storage_path, poster_path, title, aspect, duration_seconds)
        select id, 'x', 'y', 'Bad aspect', '21x9', 10 from public.products where slug = 'interactive-smart-board'`),
    ).rejects.toThrow(/check constraint/);
  });

  it('rejects a video with no duration', async () => {
    await expect(
      db.exec(`
        insert into public.product_videos (product_id, storage_path, poster_path, title, aspect, duration_seconds)
        select id, 'x', 'y', 'No duration', '4x5', 0 from public.products where slug = 'interactive-smart-board'`),
    ).rejects.toThrow(/check constraint/);
  });

  it('cannot read product_videos directly as anon', async () => {
    await expect(
      asRole(db, 'anon', (tx) => tx.query(`select * from public.product_videos limit 1`)),
    ).rejects.toThrow(/permission denied/);
  });
});
