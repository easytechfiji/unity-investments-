import {
  adminAttributeValueSchema,
  adminBannerSchema,
  adminCategorySchema,
  adminFaqSchema,
  adminPageSchema,
  adminRedirectSchema,
  adminShippingRegionSchema,
  adminSubcategorySchema,
  adminTestimonialSchema,
  idSchema,
} from '@od/shared';
import { sanitizeRichText } from '@od/shared/sanitize';
import { Router, type Request } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { HttpError } from '../../lib/errors.js';
import { MAX_UPLOAD_BYTES, type ImageFolder } from '../../lib/media.js';
import { parseInput } from '../../lib/validate.js';
import { audit } from '../../middleware/adminAuth.js';
import type { Services } from '../../services/container.js';

// One definition per admin managed table. Column names come only from these
// trusted definitions; values always travel as query parameters.

interface ResourceDef {
  table: string;
  schema: z.ZodType<Record<string, unknown>>;
  orderBy: string;
  search?: string[];
  softDelete?: boolean;
  image?: ImageFolder;
  richText?: string[];
}

export const RESOURCES: Record<string, ResourceDef> = {
  categories: {
    table: 'categories',
    schema: adminCategorySchema,
    orderBy: 'sort_order, name',
    search: ['name', 'slug'],
    softDelete: true,
    image: 'categories',
  },
  subcategories: {
    table: 'subcategories',
    schema: adminSubcategorySchema,
    orderBy: 'category_id, sort_order, name',
    search: ['name', 'slug'],
    softDelete: true,
    image: 'subcategories',
  },
  'attribute-values': {
    table: 'attribute_values',
    schema: adminAttributeValueSchema,
    orderBy: 'attribute_id, name',
    search: ['name'],
  },
  banners: {
    table: 'banners',
    schema: adminBannerSchema,
    orderBy: 'sort_order, id',
    image: 'banners',
  },
  faqs: { table: 'faqs', schema: adminFaqSchema, orderBy: 'sort_order, id', search: ['question'] },
  pages: { table: 'pages', schema: adminPageSchema, orderBy: 'kind', richText: ['body'] },
  'shipping-regions': {
    table: 'shipping_regions',
    schema: adminShippingRegionSchema,
    orderBy: 'sort_order, region_name',
    search: ['region_name'],
  },
  testimonials: {
    table: 'testimonials',
    schema: adminTestimonialSchema,
    orderBy: 'id desc',
    search: ['name'],
  },
  redirects: {
    table: 'redirects',
    schema: adminRedirectSchema,
    orderBy: 'from_path',
    search: ['from_path', 'to_path'],
  },
};

const listQuerySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  trash: z.enum(['1']).optional(),
});

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 10, fields: 5 },
});

/** Deletes need a deliberate second step: the admin app sends this header only after the person confirms. */
export function requireDeleteConfirmation(req: Request): void {
  if (req.headers['x-confirm-delete'] !== 'yes') {
    throw new HttpError(428, 'confirm_required', 'Confirm the delete first.');
  }
}

function cleanValues(def: ResourceDef, values: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...values };
  for (const column of def.richText ?? []) {
    const value = cleaned[column];
    if (typeof value === 'string') cleaned[column] = sanitizeRichText(value) || null;
  }
  return cleaned;
}

export function resourceRoutes(services: Services): Router {
  const { db, media } = services;
  const router = Router();

  function definition(name: string | string[] | undefined): ResourceDef {
    if (typeof name !== 'string') throw new HttpError(404, 'not_found', 'Not found.');
    const def = name ? RESOURCES[name] : undefined;
    if (!def) throw new HttpError(404, 'not_found', 'Not found.');
    return def;
  }

  function withImage(row: Record<string, unknown>) {
    return 'image' in row
      ? {
          ...row,
          image_url: media.imageSet(typeof row.image === 'string' ? row.image : null)?.src ?? null,
        }
      : row;
  }

  router.get('/:resource', async (req, res) => {
    const def = definition(req.params.resource);
    const query = parseInput(listQuerySchema, req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (def.softDelete) where.push(query.trash ? 'deleted_at is not null' : 'deleted_at is null');
    if (query.q && def.search) {
      params.push(`%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
      where.push(
        `(${def.search.map((column) => `${column} ilike $${params.length}`).join(' or ')})`,
      );
    }
    const found = await db.query(
      `select * from public.${def.table} ${where.length ? `where ${where.join(' and ')}` : ''} order by ${def.orderBy} limit 1000`,
      params,
    );
    res.set('Cache-Control', 'no-store').json(found.map(withImage));
  });

  router.get('/:resource/:id', async (req, res) => {
    const def = definition(req.params.resource);
    const id = parseInput(idSchema, req.params.id);
    const [row] = await db.query(`select * from public.${def.table} where id = $1`, [id]);
    if (!row) throw new HttpError(404, 'not_found', 'Not found.');
    res.set('Cache-Control', 'no-store').json(withImage(row));
  });

  router.post('/:resource', async (req, res) => {
    const def = definition(req.params.resource);
    const values = cleanValues(def, parseInput(def.schema, req.body));
    const columns = Object.keys(values);
    const [row] = await db.query<{ id: number }>(
      `insert into public.${def.table} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
      Object.values(values),
    );
    await audit(db, req, res, 'create', def.table, row?.id ?? null);
    res.status(201).json(row ? withImage(row) : null);
  });

  router.put('/:resource/:id', async (req, res) => {
    const def = definition(req.params.resource);
    const id = parseInput(idSchema, req.params.id);
    const values = cleanValues(def, parseInput(def.schema, req.body));
    const columns = Object.keys(values);
    const [row] = await db.query(
      `update public.${def.table} set ${columns.map((column, i) => `${column} = $${i + 2}`).join(', ')}
       where id = $1 ${def.softDelete ? 'and deleted_at is null' : ''} returning *`,
      [id, ...Object.values(values)],
    );
    if (!row) throw new HttpError(404, 'not_found', 'Not found.');
    await audit(db, req, res, 'update', def.table, id);
    res.json(withImage(row));
  });

  router.delete('/:resource/:id', async (req, res) => {
    const def = definition(req.params.resource);
    const id = parseInput(idSchema, req.params.id);
    requireDeleteConfirmation(req);
    const result = def.softDelete
      ? await db.query(
          `update public.${def.table} set deleted_at = now() where id = $1 and deleted_at is null returning id`,
          [id],
        )
      : await db.query<{ image?: string | null }>(
          `delete from public.${def.table} where id = $1 returning *`,
          [id],
        );
    if (result.length === 0) throw new HttpError(404, 'not_found', 'Not found.');
    const removedImage = !def.softDelete ? result[0]?.image : null;
    if (typeof removedImage === 'string') await media.deleteImage(removedImage);
    await audit(db, req, res, def.softDelete ? 'trash' : 'delete', def.table, id);
    res.json({ ok: true });
  });

  router.post('/:resource/:id/restore', async (req, res) => {
    const def = definition(req.params.resource);
    if (!def.softDelete) throw new HttpError(404, 'not_found', 'Not found.');
    const id = parseInput(idSchema, req.params.id);
    const result = await db.query(
      `update public.${def.table} set deleted_at = null where id = $1 returning id`,
      [id],
    );
    if (result.length === 0) throw new HttpError(404, 'not_found', 'Not found.');
    await audit(db, req, res, 'restore', def.table, id);
    res.json({ ok: true });
  });

  router.post('/:resource/:id/image', upload.single('file'), async (req, res) => {
    const def = definition(req.params.resource);
    if (!def.image) throw new HttpError(404, 'not_found', 'Not found.');
    const id = parseInput(idSchema, req.params.id);
    if (!req.file) throw new HttpError(400, 'no_file', 'Choose an image to upload.');
    const [existing] = await db.query<{ image: string | null }>(
      `select image from public.${def.table} where id = $1`,
      [id],
    );
    if (!existing) throw new HttpError(404, 'not_found', 'Not found.');
    const key = await media.saveImage(def.image, req.file.buffer);
    await db.query(`update public.${def.table} set image = $2 where id = $1`, [id, key]);
    if (existing.image) await media.deleteImage(existing.image);
    await audit(db, req, res, 'upload_image', def.table, id);
    res.json({ image: key, image_url: media.imageSet(key)?.src ?? null });
  });

  return router;
}
