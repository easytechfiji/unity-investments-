import {
  adminProductSchema,
  adminVariantsSchema,
  idSchema,
  moneyInput,
  slugSchema,
} from '@od/shared';
import { sanitizeRichText } from '@od/shared/sanitize';
import ExcelJS from 'exceljs';
import { Router } from 'express';
import { z } from 'zod';
import { rows, type Client } from '../../db.js';
import { HttpError } from '../../lib/errors.js';
import { parseInput } from '../../lib/validate.js';
import { audit } from '../../middleware/adminAuth.js';
import type { Services } from '../../services/container.js';
import { requireDeleteConfirmation, upload } from './resources.js';

const listQuerySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  category_id: idSchema.optional(),
  status: z.enum(['on', 'off']).optional(),
  stock: z.enum(['low', 'out']).optional(),
  availability: z.enum(['in_stock', 'arriving_soon']).optional(),
  trash: z.enum(['1']).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

const PAGE_SIZE = 50;

function productValues(input: z.output<typeof adminProductSchema>) {
  return {
    ...input,
    description: input.description ? sanitizeRichText(input.description) || null : null,
    buyers_guide: input.buyers_guide ? sanitizeRichText(input.buyers_guide) || null : null,
    // Variable products keep price and stock on their variants.
    color_id: input.type === 'simple' ? input.color_id : null,
    size_id: input.type === 'simple' ? input.size_id : null,
  };
}

async function checkSubcategory(
  client: Client | Services['db'],
  categoryId: number,
  subcategoryId: number,
): Promise<void> {
  const sql = 'select 1 from public.subcategories where id = $1 and category_id = $2';
  const found =
    'tx' in client
      ? await client.query(sql, [subcategoryId, categoryId])
      : await rows(client, sql, [subcategoryId, categoryId]);
  if (found.length === 0)
    throw new HttpError(400, 'invalid_input', 'The subcategory does not belong to that category.', [
      { path: 'subcategory_id', message: 'Choose a subcategory of the selected category' },
    ]);
}

// Excel import and export ---------------------------------------------------

/** Columns of the old site's import (Appendix E), plus the category, SKU and featured columns this schema needs. */
export const EXCEL_COLUMNS = [
  'name',
  'slug',
  'sku',
  'category_slug',
  'subcategory_slug',
  'small_description',
  'description',
  'original_price',
  'selling_price',
  'qty',
  'tax',
  'status',
  'trending',
  'featured',
  'meta_title',
  'meta_keywords',
  'meta_description',
] as const;

const flag = z
  .union([z.boolean(), z.number(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === '') return undefined;
    return (
      value === true ||
      value === 1 ||
      ['1', 'yes', 'true', 'y'].includes(String(value).trim().toLowerCase())
    );
  });

const cellText = (max: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : String(value).trim()))
    .pipe(z.string().max(max).optional());

const importRowSchema = z.object({
  name: cellText(300).pipe(z.string().min(1, 'Name is required')),
  slug: cellText(200).pipe(slugSchema),
  sku: cellText(64),
  category_slug: cellText(200),
  subcategory_slug: cellText(200),
  small_description: cellText(500),
  description: cellText(50000),
  original_price: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : String(value).trim()))
    .pipe(moneyInput.optional()),
  selling_price: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : String(value).trim()))
    .pipe(moneyInput.optional()),
  qty: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : Number(value)))
    .pipe(z.number().int().min(0).max(1_000_000).optional()),
  tax: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : Number(value)))
    .pipe(z.number().min(0).max(100).optional()),
  status: flag,
  trending: flag,
  featured: flag,
  meta_title: cellText(80),
  meta_keywords: cellText(200),
  meta_description: cellText(200),
});

type ImportRow = z.output<typeof importRowSchema>;

function cellValue(cell: ExcelJS.CellValue): string | number | boolean | undefined {
  if (cell === null || cell === undefined) return undefined;
  if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean')
    return cell;
  if (cell instanceof Date) return cell.toISOString();
  if (typeof cell === 'object' && 'text' in cell && typeof cell.text === 'string') return cell.text;
  if (typeof cell === 'object' && 'result' in cell) return cellValue(cell.result);
  if (typeof cell === 'object' && 'richText' in cell)
    return cell.richText.map((part) => part.text).join('');
  return undefined;
}

export async function readImportFile(buffer: Buffer): Promise<{
  rows: { row: number; data: ImportRow }[];
  errors: { row: number; field: string; message: string }[];
}> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new HttpError(400, 'bad_file', 'That file is not an Excel .xlsx workbook.');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new HttpError(400, 'bad_file', 'The workbook has no sheets.');
  const header = (sheet.getRow(1).values as ExcelJS.CellValue[]).map((value) =>
    String(cellValue(value) ?? '')
      .trim()
      .toLowerCase(),
  );
  if (!header.includes('name') || !header.includes('slug')) {
    throw new HttpError(
      400,
      'bad_file',
      'The first row must hold column names, including name and slug.',
    );
  }
  const parsed: { row: number; data: ImportRow }[] = [];
  const errors: { row: number; field: string; message: string }[] = [];
  const slugs = new Set<string>();
  for (let index = 2; index <= Math.min(sheet.rowCount, 5001); index += 1) {
    const values = sheet.getRow(index).values as ExcelJS.CellValue[];
    const record: Record<string, unknown> = {};
    header.forEach((column, position) => {
      if ((EXCEL_COLUMNS as readonly string[]).includes(column))
        record[column] = cellValue(values[position] ?? null);
    });
    if (Object.values(record).every((value) => value === undefined || value === '')) continue;
    const result = importRowSchema.safeParse(record);
    if (!result.success) {
      for (const issue of result.error.issues)
        errors.push({ row: index, field: issue.path.join('.') || 'row', message: issue.message });
      continue;
    }
    if (slugs.has(result.data.slug)) {
      errors.push({
        row: index,
        field: 'slug',
        message: 'This slug appears more than once in the file',
      });
      continue;
    }
    slugs.add(result.data.slug);
    parsed.push({ row: index, data: result.data });
  }
  if (sheet.rowCount > 5001)
    errors.push({
      row: 5002,
      field: 'row',
      message: 'Only the first 5000 products are read. Split the file.',
    });
  return { rows: parsed, errors };
}

export function productRoutes(services: Services): Router {
  const { db, media } = services;
  const router = Router();

  router.get('/products', async (req, res) => {
    const query = parseInput(listQuerySchema, req.query);
    const where = [query.trash ? 'p.deleted_at is not null' : 'p.deleted_at is null'];
    const params: unknown[] = [];
    if (query.q) {
      params.push(`%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
      where.push(
        `(p.name ilike $${params.length} or p.sku ilike $${params.length} or p.slug ilike $${params.length})`,
      );
    }
    if (query.category_id) {
      params.push(query.category_id);
      where.push(`p.category_id = $${params.length}`);
    }
    if (query.status) where.push(query.status === 'on' ? 'p.status' : 'not p.status');
    const stockExpr = `case when p.type = 'variable' then coalesce((select sum(v.stock) from public.product_variants v where v.product_id = p.id), 0) else p.stock end`;
    if (query.stock === 'low') where.push(`${stockExpr} between 1 and 5`);
    if (query.stock === 'out') where.push(`${stockExpr} <= 0`);
    if (query.availability) {
      params.push(query.availability);
      where.push(`p.availability = $${params.length}`);
    }
    params.push(PAGE_SIZE, (query.page - 1) * PAGE_SIZE);
    const found = await db.query<{ image: string | null; total: number }>(
      `select p.id, p.name, p.slug, p.sku, p.type, p.original_price, p.sale_price, p.status, p.featured, p.image, p.availability,
              p.updated_at, p.deleted_at, c.name as category_name, s.name as subcategory_name,
              ${stockExpr} as stock, count(*) over () as total
       from public.products p
       join public.categories c on c.id = p.category_id
       join public.subcategories s on s.id = p.subcategory_id
       where ${where.join(' and ')}
       order by p.updated_at desc, p.id desc
       limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    res.set('Cache-Control', 'no-store').json({
      products: found.map((row) => ({ ...row, image_url: media.imageSet(row.image)?.src ?? null })),
      total: found[0]?.total ?? 0,
      page: query.page,
      pageSize: PAGE_SIZE,
    });
  });

  router.get('/products/export.xlsx', async (req, res) => {
    const products = await db.query<Record<string, unknown>>(
      `select p.name, p.slug, p.sku, c.slug as category_slug, s.slug as subcategory_slug, p.small_description,
              p.description, p.original_price, p.sale_price as selling_price, p.stock as qty, p.tax,
              p.status, p.trending, p.featured, p.meta_title, p.meta_keywords, p.meta_description
       from public.products p
       join public.categories c on c.id = p.category_id
       join public.subcategories s on s.id = p.subcategory_id
       where p.deleted_at is null order by p.name`,
    );
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Products');
    sheet.columns = EXCEL_COLUMNS.map((key) => ({
      header: key,
      key,
      width: key.includes('description') ? 40 : 18,
    }));
    for (const product of products) {
      sheet.addRow(
        Object.fromEntries(
          EXCEL_COLUMNS.map((key) => {
            const value = product[key];
            // Numbers stay text so prices keep their exact decimals; flags become 1 or 0.
            return [key, typeof value === 'boolean' ? (value ? 1 : 0) : (value ?? '')];
          }),
        ),
      );
    }
    sheet.getRow(1).font = { bold: true };
    await audit(db, req, res, 'export', 'products', null);
    res
      .set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .set(
        'Content-Disposition',
        `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      )
      .set('Cache-Control', 'no-store')
      .send(Buffer.from(await workbook.xlsx.writeBuffer()));
  });

  router.post('/products/import', upload.single('file'), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'no_file', 'Choose an Excel file to import.');
    const dryRun = req.query.dryRun === '1';
    const { rows: parsed, errors } = await readImportFile(req.file.buffer);
    let created = 0;
    let updated = 0;

    // All or nothing: if any row has a problem, no row is saved.
    await db
      .tx(async (client) => {
        const categories = await rows<{ id: number; slug: string }>(
          client,
          'select id, slug from public.categories where deleted_at is null',
        );
        const subcategories = await rows<{ id: number; slug: string; category_id: number }>(
          client,
          'select id, slug, category_id from public.subcategories where deleted_at is null',
        );
        for (const { row, data } of parsed) {
          const [existing] = await rows<{
            id: number;
            category_id: number;
            subcategory_id: number;
          }>(
            client,
            'select id, category_id, subcategory_id from public.products where slug = $1',
            [data.slug],
          );
          let categoryId = existing?.category_id;
          let subcategoryId = existing?.subcategory_id;
          if (data.category_slug || data.subcategory_slug || !existing) {
            const category = categories.find((item) => item.slug === data.category_slug);
            const subcategory = subcategories.find(
              (item) => item.slug === data.subcategory_slug && item.category_id === category?.id,
            );
            if (!category) {
              errors.push({ row, field: 'category_slug', message: 'Unknown category slug' });
              continue;
            }
            if (!subcategory) {
              errors.push({
                row,
                field: 'subcategory_slug',
                message: 'Unknown subcategory slug for that category',
              });
              continue;
            }
            categoryId = category.id;
            subcategoryId = subcategory.id;
          }
          const sale =
            data.selling_price && Number(data.selling_price) > 0 ? data.selling_price : null;
          if (sale && data.original_price && Number(sale) >= Number(data.original_price)) {
            errors.push({
              row,
              field: 'selling_price',
              message: 'Sale price must be lower than the regular price',
            });
            continue;
          }
          const values: Record<string, unknown> = {
            name: data.name,
            sku: data.sku,
            category_id: categoryId,
            subcategory_id: subcategoryId,
            small_description: data.small_description,
            description:
              data.description === undefined
                ? undefined
                : sanitizeRichText(data.description) || null,
            original_price: data.original_price,
            sale_price: data.selling_price === undefined ? undefined : sale,
            stock: data.qty,
            tax: data.tax,
            status: data.status,
            trending: data.trending,
            featured: data.featured,
            meta_title: data.meta_title,
            meta_keywords: data.meta_keywords,
            meta_description: data.meta_description,
          };
          const present = Object.entries(values).filter(([, value]) => value !== undefined);
          if (existing) {
            await client.query(
              `update public.products set ${present.map(([column], i) => `${column} = $${i + 2}`).join(', ')} where id = $1`,
              [existing.id, ...present.map(([, value]) => value)],
            );
            updated += 1;
          } else {
            const all = [['slug', data.slug], ...present] as [string, unknown][];
            await client.query(
              `insert into public.products (${all.map(([column]) => column).join(', ')}) values (${all.map((_, i) => `$${i + 1}`).join(', ')})`,
              all.map(([, value]) => value),
            );
            created += 1;
          }
        }
        if (errors.length || dryRun) throw new RollbackSignal();
      })
      .catch((error: unknown) => {
        if (!(error instanceof RollbackSignal)) throw error;
      });

    const saved = errors.length === 0 && !dryRun;
    if (saved)
      await audit(db, req, res, 'import', 'products', `${created} created, ${updated} updated`);
    res.json({
      saved,
      dryRun,
      created: saved || dryRun ? created : 0,
      updated: saved || dryRun ? updated : 0,
      errors: errors.sort((a, b) => a.row - b.row),
    });
  });

  router.get('/products/:id', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const [product] = await db.query<{ image: string | null }>(
      'select * from public.products where id = $1',
      [id],
    );
    if (!product) throw new HttpError(404, 'not_found', 'Not found.');
    const variants = await db.query(
      'select * from public.product_variants where product_id = $1 order by id',
      [id],
    );
    const images = await db.query<{ id: number; image: string }>(
      'select id, image, sort_order from public.product_images where product_id = $1 order by sort_order, id',
      [id],
    );
    res.set('Cache-Control', 'no-store').json({
      ...product,
      image_url: media.imageSet(product.image)?.src ?? null,
      variants,
      images: images.map((image) => ({
        ...image,
        image_url: media.imageSet(image.image)?.src ?? null,
      })),
    });
  });

  router.post('/products', async (req, res) => {
    const input = parseInput(adminProductSchema, req.body);
    await checkSubcategory(db, input.category_id, input.subcategory_id);
    const values = productValues(input);
    const columns = Object.keys(values);
    const [row] = await db.query<{ id: number }>(
      `insert into public.products (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
      Object.values(values),
    );
    await audit(db, req, res, 'create', 'products', row?.id ?? null);
    res.status(201).json(row);
  });

  router.put('/products/:id', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const input = parseInput(adminProductSchema, req.body);
    await checkSubcategory(db, input.category_id, input.subcategory_id);
    const values = productValues(input);
    const columns = Object.keys(values);
    const [row] = await db.query<{ id: number; old_slug: string }>(
      `update public.products set ${columns.map((column, i) => `${column} = $${i + 2}`).join(', ')}
       where id = $1 returning id`,
      [id, ...Object.values(values)],
    );
    if (!row) throw new HttpError(404, 'not_found', 'Not found.');
    await audit(db, req, res, 'update', 'products', id);
    res.json(row);
  });

  router.delete('/products/:id', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    requireDeleteConfirmation(req);
    const result = await db.query(
      'update public.products set deleted_at = now() where id = $1 and deleted_at is null returning id',
      [id],
    );
    if (!result.length) throw new HttpError(404, 'not_found', 'Not found.');
    await audit(db, req, res, 'trash', 'products', id);
    res.json({ ok: true });
  });

  router.post('/products/:id/restore', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const result = await db.query(
      'update public.products set deleted_at = null where id = $1 returning id',
      [id],
    );
    if (!result.length) throw new HttpError(404, 'not_found', 'Not found.');
    await audit(db, req, res, 'restore', 'products', id);
    res.json({ ok: true });
  });

  router.put('/products/:id/variants', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const { variants } = parseInput(adminVariantsSchema, req.body);
    await db.tx(async (client) => {
      const [product] = await rows<{ type: string }>(
        client,
        'select type from public.products where id = $1 for update',
        [id],
      );
      if (!product) throw new HttpError(404, 'not_found', 'Not found.');
      // Colours must come from the Colour group and sizes from the Size group.
      const groups = await rows<{ id: number; code: string }>(
        client,
        `select v.id, o.code from public.attribute_values v join public.attribute_options o on o.id = v.attribute_id`,
      );
      variants.forEach((variant, index) => {
        if (
          variant.color_id !== null &&
          groups.find((group) => group.id === variant.color_id)?.code !== 'colour'
        ) {
          throw new HttpError(400, 'invalid_input', 'That colour is not in the Colour list.', [
            { path: `variants.${index}.color_id`, message: 'Not a colour' },
          ]);
        }
        if (
          variant.size_id !== null &&
          groups.find((group) => group.id === variant.size_id)?.code !== 'size'
        ) {
          throw new HttpError(400, 'invalid_input', 'That size is not in the Size list.', [
            { path: `variants.${index}.size_id`, message: 'Not a size' },
          ]);
        }
      });
      const keep = variants
        .map((variant) => variant.id)
        .filter((value): value is number => value !== undefined);
      await client.query(
        'delete from public.product_variants where product_id = $1 and not (id = any($2::bigint[]))',
        [id, keep],
      );
      for (const variant of variants) {
        if (variant.id) {
          const result = await client.query(
            'update public.product_variants set sku = $3, color_id = $4, size_id = $5, price = $6, stock = $7 where id = $1 and product_id = $2',
            [
              variant.id,
              id,
              variant.sku,
              variant.color_id,
              variant.size_id,
              variant.price,
              variant.stock,
            ],
          );
          if (result.rowCount === 0)
            throw new HttpError(400, 'invalid_input', 'A variant does not belong to this product.');
        } else {
          await client.query(
            'insert into public.product_variants (product_id, sku, color_id, size_id, price, stock) values ($1, $2, $3, $4, $5, $6)',
            [id, variant.sku, variant.color_id, variant.size_id, variant.price, variant.stock],
          );
        }
      }
      await client.query('update public.products set updated_at = now() where id = $1', [id]);
    });
    await audit(db, req, res, 'update_variants', 'products', id);
    res.json({ ok: true });
  });

  router.post('/products/:id/images', upload.array('files', 10), async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) throw new HttpError(400, 'no_file', 'Choose at least one image.');
    const [product] = await db.query<{ image: string | null }>(
      'select image from public.products where id = $1',
      [id],
    );
    if (!product) throw new HttpError(404, 'not_found', 'Not found.');
    let hasMain = Boolean(product.image);
    for (const file of files) {
      const key = await media.saveImage('products', file.buffer);
      if (!hasMain) {
        await db.query('update public.products set image = $2 where id = $1', [id, key]);
        hasMain = true;
      } else {
        await db.query(
          `insert into public.product_images (product_id, image, sort_order)
           values ($1, $2, coalesce((select max(sort_order) + 1 from public.product_images where product_id = $1), 0))`,
          [id, key],
        );
      }
    }
    await db.query('update public.products set updated_at = now() where id = $1', [id]);
    await audit(db, req, res, 'upload_images', 'products', id);
    res.json({ ok: true, uploaded: files.length });
  });

  router.post('/products/:id/images/:imageId/main', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const imageId = parseInput(idSchema, req.params.imageId);
    await db.tx(async (client) => {
      const [image] = await rows<{ image: string }>(
        client,
        'select image from public.product_images where id = $1 and product_id = $2',
        [imageId, id],
      );
      const [product] = await rows<{ image: string | null }>(
        client,
        'select image from public.products where id = $1 for update',
        [id],
      );
      if (!image || !product) throw new HttpError(404, 'not_found', 'Not found.');
      await client.query('update public.products set image = $2 where id = $1', [id, image.image]);
      if (product.image)
        await client.query('update public.product_images set image = $2 where id = $1', [
          imageId,
          product.image,
        ]);
      else await client.query('delete from public.product_images where id = $1', [imageId]);
    });
    await audit(db, req, res, 'set_main_image', 'products', id);
    res.json({ ok: true });
  });

  router.delete('/products/:id/images/:imageId', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const imageId = parseInput(idSchema, req.params.imageId);
    requireDeleteConfirmation(req);
    const [removed] = await db.query<{ image: string }>(
      'delete from public.product_images where id = $1 and product_id = $2 returning image',
      [imageId, id],
    );
    if (!removed) throw new HttpError(404, 'not_found', 'Not found.');
    await media.deleteImage(removed.image);
    await audit(db, req, res, 'delete_image', 'products', id);
    res.json({ ok: true });
  });

  router.delete('/products/:id/main-image', async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    requireDeleteConfirmation(req);
    const [before] = await db.query<{ image: string | null }>(
      'select image from public.products where id = $1',
      [id],
    );
    if (!before) throw new HttpError(404, 'not_found', 'Not found.');
    await db.query('update public.products set image = null where id = $1', [id]);
    if (before.image) await media.deleteImage(before.image);
    await audit(db, req, res, 'delete_image', 'products', id);
    res.json({ ok: true });
  });

  return router;
}

class RollbackSignal extends Error {
  override name = 'RollbackSignal';
}
