// Copies the bedding products from the old Unity Investment catalogue (VAULT) into this shop.
//
//   npm run import:vault
//
// Reads the old catalogue through its public, read-only Supabase API (VAULT_SUPABASE_URL and
// VAULT_SUPABASE_PUBLISHABLE_KEY in apps/api/.env). Writes to this shop's database
// (DATABASE_URL) and stores the photos with the shop's own image code, so each photo is
// re-encoded to the WebP sizes the storefront expects (local folder or Supabase Storage,
// depending on STORAGE_DRIVER).
//
// Safe to run more than once: categories, subcategories and products are matched by slug and
// existing ones are left alone. Add --dry-run to only print what would happen.
//
// The old VAULT project may be deleted. Add --from <folder> to read a saved backup instead
// (tables/items.json, tables/categories.json and storage/item-images/...), for example
// npm run import:vault -- --from ../../legacy/vault-backup-2026-11-21
//
// The old catalogue had no prices or stock counts, so every product starts at price 0 (the
// storefront shows "Request a quote") and stock 0. Enter real prices in the admin.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadConfig } from '../src/config/env.js';
import { createMediaStore } from '../src/lib/media.js';

interface VaultItem {
  name: string;
  description: string | null;
  image_url: string | null;
  image_path: string | null;
  is_upcoming: boolean;
}

// The old catalogue's public photo bucket. Some items have only image_path filled in.
const VAULT_BUCKET = 'item-images';

const CATEGORY = { slug: 'blankets-bedding', name: 'Blankets & Bedding' };
// Grouped by the names the old catalogue used. Upcoming items were not yet in stock.
const SUBCATEGORIES = [
  { slug: 'double-bed-bedsheets', name: 'Double bed bedsheets', sort: 1 },
  { slug: 'bedding-sets', name: 'Bedding sets', sort: 2 },
  { slug: 'new-arrivals', name: 'New arrivals', sort: 3 },
] as const;
// Placeholder text from the old site that says nothing about the product.
const EMPTY_DESCRIPTIONS = new Set(['view product details and availability.']);

function subcategoryFor(item: VaultItem): (typeof SUBCATEGORIES)[number]['slug'] {
  if (item.is_upcoming) return 'new-arrivals';
  if (/bedding set/i.test(item.name)) return 'bedding-sets';
  return 'double-bed-bedsheets';
}

/** Lowercase words joined by hyphens, the format the database's slug rule accepts. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

const dryRun = process.argv.includes('--dry-run');
const fromIndex = process.argv.indexOf('--from');
const backupDir = fromIndex === -1 ? undefined : process.argv[fromIndex + 1];
const vaultUrl = process.env.VAULT_SUPABASE_URL?.replace(/\/$/, '');
const vaultKey = process.env.VAULT_SUPABASE_PUBLISHABLE_KEY;
if (!backupDir && (!vaultUrl || !vaultKey)) {
  console.error(
    'Set VAULT_SUPABASE_URL and VAULT_SUPABASE_PUBLISHABLE_KEY in apps/api/.env, ' +
      'or give --from <backup folder>.',
  );
  process.exit(1);
}

const config = loadConfig(process.env);
if (!config.DATABASE_URL) {
  console.error('Set DATABASE_URL in apps/api/.env.');
  process.exit(1);
}
const media = createMediaStore(config);

/** Reads the active items of the category from a saved backup (tables/*.json). */
async function readBackup(dir: string): Promise<VaultItem[]> {
  const read = async <T>(name: string) =>
    JSON.parse(await readFile(path.join(dir, 'tables', name), 'utf8')) as T;
  const categories = await read<{ id: string; slug: string }[]>('categories.json');
  const category = categories.find((c) => c.slug === CATEGORY.slug);
  const rows =
    await read<(VaultItem & { category_id: string; is_active: boolean; created_at: string })[]>(
      'items.json',
    );
  return rows
    .filter((row) => row.category_id === category?.id && row.is_active)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Reads the active items of the category from the live old catalogue. */
async function readLive(): Promise<VaultItem[]> {
  const query = new URLSearchParams({
    select: 'name,description,image_url,image_path,is_upcoming,category:categories!inner(slug)',
    'category.slug': `eq.${CATEGORY.slug}`,
    is_active: 'eq.true',
    order: 'created_at.asc',
  });
  const response = await fetch(`${vaultUrl}/rest/v1/items?${query.toString()}`, {
    headers: { apikey: vaultKey ?? '', Authorization: `Bearer ${vaultKey}` },
  });
  if (!response.ok) {
    console.error(`Could not read the old catalogue (status ${response.status}).`);
    process.exit(1);
  }
  return (await response.json()) as VaultItem[];
}

const items = backupDir ? await readBackup(backupDir) : await readLive();
console.log(
  `Old catalogue${backupDir ? ' (from backup)' : ''}: ${items.length} active ${CATEGORY.name} items.`,
);

const client = new pg.Client({ connectionString: config.DATABASE_URL });
await client.connect();

async function idFor(sql: string, values: unknown[]): Promise<number> {
  const result = await client.query<{ id: number }>(sql, values);
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error('Expected a row id');
  return id;
}

try {
  const existingCategory = await client.query<{ id: number }>(
    'select id from public.categories where slug = $1',
    [CATEGORY.slug],
  );
  let categoryId = existingCategory.rows[0]?.id;
  if (categoryId === undefined && !dryRun) {
    categoryId = await idFor(
      'insert into public.categories (name, slug, sort_order) values ($1, $2, 1) returning id',
      [CATEGORY.name, CATEGORY.slug],
    );
  }

  const subcategoryIds = new Map<string, number>();
  for (const sub of SUBCATEGORIES) {
    const found = await client.query<{ id: number }>(
      'select id from public.subcategories where slug = $1',
      [sub.slug],
    );
    let id = found.rows[0]?.id;
    if (id === undefined && !dryRun && categoryId !== undefined) {
      id = await idFor(
        'insert into public.subcategories (category_id, name, slug, sort_order) values ($1, $2, $3, $4) returning id',
        [categoryId, sub.name, sub.slug, sub.sort],
      );
    }
    if (id !== undefined) subcategoryIds.set(sub.slug, id);
  }

  /** Downloads the item's photo and stores it in this shop's format. Null if there is none. */
  async function copyPhoto(item: VaultItem): Promise<string | null> {
    if (backupDir) {
      const inBucket =
        item.image_path ?? item.image_url?.split(`/${VAULT_BUCKET}/`)[1]?.split('?')[0];
      if (!inBucket) return null;
      try {
        const file = path.join(
          backupDir,
          'storage',
          VAULT_BUCKET,
          ...decodeURIComponent(inBucket).split('/'),
        );
        return media.saveImage('products', await readFile(file));
      } catch {
        console.warn(`No photo for ${item.name} in the backup.`);
        return null;
      }
    }
    const url =
      item.image_url ??
      (item.image_path
        ? `${vaultUrl}/storage/v1/object/public/${VAULT_BUCKET}/${item.image_path}`
        : null);
    if (!url) return null;
    const photo = await fetch(url);
    if (!photo.ok) {
      console.warn(`No photo for ${item.name} (status ${photo.status}).`);
      return null;
    }
    return media.saveImage('products', Buffer.from(await photo.arrayBuffer()));
  }

  let created = 0;
  let skipped = 0;
  let photosAdded = 0;
  for (const item of items) {
    const slug = slugify(item.name);
    const existing = await client.query<{ id: number; image: string | null }>(
      'select id, image from public.products where slug = $1',
      [slug],
    );
    const found = existing.rows[0];
    if (found) {
      // Already imported. Only fill in a missing photo; never overwrite the owner's changes.
      if (!found.image && !dryRun) {
        const image = await copyPhoto(item);
        if (image) {
          await client.query('update public.products set image = $1 where id = $2', [
            image,
            found.id,
          ]);
          photosAdded += 1;
        }
      }
      skipped += 1;
      continue;
    }
    const sub = subcategoryFor(item);
    if (dryRun) {
      console.log(`Would add: ${item.name} (${sub})`);
      created += 1;
      continue;
    }

    const image = await copyPhoto(item);
    const description = item.description?.trim() ?? '';
    await client.query(
      `insert into public.products
         (category_id, subcategory_id, name, slug, small_description, image, original_price, stock)
       values ($1, $2, $3, $4, $5, $6, 0, 0)`,
      [
        categoryId,
        subcategoryIds.get(sub),
        item.name,
        slug,
        description && !EMPTY_DESCRIPTIONS.has(description.toLowerCase()) ? description : null,
        image,
      ],
    );
    created += 1;
  }
  console.log(
    `${dryRun ? 'Would add' : 'Added'} ${created} products, skipped ${skipped} that already exist` +
      (photosAdded ? ` (added a missing photo to ${photosAdded} of them).` : '.'),
  );
} finally {
  await client.end();
}
