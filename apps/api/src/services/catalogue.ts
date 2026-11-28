import {
  productPath,
  type Availability,
  type Banner,
  type CategoryPage,
  type CategorySummary,
  type ContentPage,
  type Faq,
  type HomeData,
  type MenuCategory,
  type ProductCard,
  type ProductDetail,
  type ProductListResult,
  type ProductVideo,
  type ShippingRegion,
  type SitemapEntry,
  type SpotlightProduct,
  type StockStatus,
  type SubcategoryPage,
  type SubcategorySummary,
} from '@od/shared';
import { sanitizeRichText } from '@od/shared/sanitize';
import { rows, type Client, type Db } from '../db.js';
import type { MediaStore } from '../lib/media.js';
import type { VideoStore } from '../lib/video.js';

// Home page rows from the design brief, shown only if these categories exist.
const HOME_ROW_CATEGORIES = ['blankets-bedding'];
const LOW_STOCK = 5;

// "Recommended" is the default order: products in stock before products
// arriving soon, then spotlighted products, then trending products, then the
// owner's manual rank, then name. Every key ends
// with `id asc` (or `id desc`) as a tie-break, so that two products which are
// otherwise equal always come out in the same order. Without that, page 2 of
// a list could repeat or skip a row depending on how the database happens to
// read ties back.
export const SORTS = {
  recommended:
    "(availability = 'in_stock') desc, spotlight desc, trending desc, sort_rank asc, name asc, id asc",
  newest: 'created_at desc, id desc',
  price_asc: 'nullif(effective_price, 0) asc nulls last, name asc, id asc',
  price_desc: 'nullif(effective_price, 0) desc nulls last, name asc, id asc',
  name_asc: 'lower(name) asc, id asc',
  name_desc: 'lower(name) desc, id asc',
} as const;
export type SortKey = keyof typeof SORTS;

export interface ProductFilters {
  category?: string;
  subcategory?: string;
  search?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: boolean;
  sort: SortKey;
  page: number;
  pageSize: number;
}

interface ProductRow {
  id: number;
  slug: string;
  name: string;
  sku: string | null;
  type: 'simple' | 'variable';
  small_description: string | null;
  description: string | null;
  buyers_guide: string | null;
  original_price: string;
  sale_price: string | null;
  price_min: string | null;
  price_max: string | null;
  stock: number;
  image: string | null;
  category_slug: string;
  category_name: string;
  subcategory_slug: string;
  subcategory_name: string;
  meta_title: string | null;
  meta_description: string | null;
  updated_at: Date;
  spotlight: boolean;
  sort_rank: number;
  quote_size_options: string[] | null;
  availability: Availability;
  total_count?: number;
  [key: string]: unknown;
}

function stockStatus(stock: number): StockStatus {
  if (stock <= 0) return 'out_of_stock';
  return stock <= LOW_STOCK ? 'low_stock' : 'in_stock';
}

const isZero = (value: string | null) => value === null || Number(value) === 0;

function toCard(row: ProductRow, media: MediaStore): ProductCard {
  let price: string | null;
  let wasPrice: string | null = null;
  let priceMax: string | null = null;
  if (row.type === 'variable') {
    price = isZero(row.price_min) ? null : row.price_min;
    priceMax = row.price_max && row.price_max !== row.price_min ? row.price_max : null;
  } else if (row.sale_price) {
    price = row.sale_price;
    wasPrice = row.original_price;
  } else {
    price = isZero(row.original_price) ? null : row.original_price;
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    type: row.type,
    price,
    wasPrice,
    priceMax,
    availability: row.availability,
    // A product that has not arrived has no count to show.
    stock: row.availability === 'arriving_soon' ? 0 : row.stock,
    stockStatus: stockStatus(row.availability === 'arriving_soon' ? 0 : row.stock),
    image: media.imageSet(row.image),
    categorySlug: row.category_slug,
    subcategorySlug: row.subcategory_slug,
    url: productPath(row.category_slug, row.subcategory_slug, row.slug),
  };
}

interface CategoryRow {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  meta_title: string | null;
  meta_description: string | null;
  category_id?: number;
  category_slug?: string;
  category_name?: string;
  [key: string]: unknown;
}

function toCategory(row: CategoryRow, media: MediaStore): CategorySummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    image: media.imageSet(row.image),
  };
}

function toSubcategory(row: CategoryRow, media: MediaStore): SubcategorySummary {
  return {
    ...toCategory(row, media),
    categoryId: row.category_id ?? 0,
    categorySlug: row.category_slug ?? '',
    categoryName: row.category_name ?? '',
  };
}

const PRODUCT_BASE = `
  select p.*,
         case when p.type = 'variable' then p.price_min else coalesce(p.sale_price, p.original_price) end
           as effective_price
  from public.public_products p`;

/** Escapes % and _ so a search for "50%" means the characters, not a wildcard. */
function likePattern(word: string): string {
  return `%${word.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function filterSql(filters: ProductFilters, params: unknown[], includePrice: boolean): string {
  const where: string[] = [];
  const add = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.category) where.push(`category_slug = ${add(filters.category)}`);
  if (filters.subcategory) where.push(`subcategory_slug = ${add(filters.subcategory)}`);
  const words = (filters.search ?? '').split(/\s+/).filter(Boolean).slice(0, 8);
  for (const word of words) {
    const param = add(likePattern(word));
    where.push(`(name ilike ${param} or sku ilike ${param} or small_description ilike ${param})`);
  }
  if (includePrice && filters.minPrice)
    where.push(`effective_price >= ${add(filters.minPrice)}::numeric`);
  if (includePrice && filters.maxPrice)
    where.push(`effective_price <= ${add(filters.maxPrice)}::numeric`);
  if (filters.inStock) where.push("availability = 'in_stock' and stock > 0");
  return where.length ? `where ${where.join(' and ')}` : '';
}

export function createCatalogue(db: Db, media: MediaStore, video: VideoStore) {
  const anon = <T>(work: (client: Client) => Promise<T>) => db.asAnon(work);

  async function listProducts(filters: ProductFilters): Promise<ProductListResult> {
    return anon(async (client) => {
      const params: unknown[] = [];
      const where = filterSql(filters, params, true);
      params.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
      const products = await rows<ProductRow>(
        client,
        `with base as (${PRODUCT_BASE})
         select *, count(*) over () as total_count from base ${where}
         order by ${SORTS[filters.sort]}
         limit $${params.length - 1} offset $${params.length}`,
        params,
      );

      const rangeParams: unknown[] = [];
      const rangeWhere = filterSql({ ...filters, inStock: false }, rangeParams, false);
      const [range] = await rows<{ min: string | null; max: string | null }>(
        client,
        `with base as (${PRODUCT_BASE})
         select min(nullif(effective_price, 0))::text as min, max(effective_price)::text as max
         from base ${rangeWhere}`,
        rangeParams,
      );

      const total =
        products[0]?.total_count ?? (filters.page > 1 ? await countAll(client, filters) : 0);
      return {
        products: products.map((row) => toCard(row, media)),
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
        priceRange: range?.min && range.max ? { min: range.min, max: range.max } : null,
      };
    });
  }

  async function countAll(client: Client, filters: ProductFilters): Promise<number> {
    const params: unknown[] = [];
    const where = filterSql(filters, params, true);
    const [row] = await rows<{ n: number }>(
      client,
      `with base as (${PRODUCT_BASE}) select count(*) as n from base ${where}`,
      params,
    );
    return row?.n ?? 0;
  }

  async function getProduct(slug: string): Promise<ProductDetail | null> {
    return anon(async (client) => {
      const [row] = await rows<ProductRow>(client, `${PRODUCT_BASE} where p.slug = $1`, [slug]);
      if (!row) return null;
      const images = await rows<{ image: string }>(
        client,
        'select image from public.public_product_images where product_id = $1 order by sort_order, id',
        [row.id],
      );
      const variants = await rows<{
        id: number;
        sku: string | null;
        color_name: string | null;
        size_name: string | null;
        price: string;
        stock: number;
      }>(
        client,
        'select id, sku, color_name, size_name, price, stock from public.public_product_variants where product_id = $1 order by price, id',
        [row.id],
      );
      const related = await rows<ProductRow>(
        client,
        `${PRODUCT_BASE} where p.subcategory_id = (select subcategory_id from public.public_products where id = $1)
           and p.id <> $1
         order by p.featured desc, p.created_at desc limit 8`,
        [row.id],
      );
      const videoRows = await rows<{
        id: number;
        title: string;
        description: string | null;
        storage_path: string;
        poster_path: string;
        aspect: ProductVideo['aspect'];
        duration_seconds: number;
        transcript: string | null;
        created_at: Date;
      }>(
        client,
        `select id, title, description, storage_path, poster_path, aspect, duration_seconds, transcript, created_at
         from public.public_product_videos where product_id = $1 order by sort_order, id`,
        [row.id],
      );
      const card = toCard(row, media);
      const gallery = [row.image, ...images.map((image) => image.image)]
        .map((key) => media.imageSet(key))
        .filter((image) => image !== null);
      return {
        ...card,
        smallDescription: row.small_description,
        description: row.description ? sanitizeRichText(row.description) : null,
        buyersGuide: row.buyers_guide ? sanitizeRichText(row.buyers_guide) : null,
        categoryName: row.category_name,
        subcategoryName: row.subcategory_name,
        gallery,
        variants: variants.map((variant) => ({
          id: variant.id,
          sku: variant.sku,
          colour: variant.color_name,
          size: variant.size_name,
          price: variant.price,
          stock: row.availability === 'arriving_soon' ? 0 : variant.stock,
        })),
        videos: videoRows
          .map((videoRow) => {
            const url = video.videoUrl(videoRow.storage_path);
            if (!url) return null;
            return {
              id: videoRow.id,
              title: videoRow.title,
              description: videoRow.description,
              url,
              poster: media.imageSet(videoRow.poster_path),
              aspect: videoRow.aspect,
              durationSeconds: videoRow.duration_seconds,
              transcript: videoRow.transcript,
              uploadedAt: videoRow.created_at.toISOString(),
            };
          })
          .filter((item): item is ProductVideo => item !== null),
        quoteSizeOptions: row.quote_size_options,
        metaTitle: row.meta_title,
        metaDescription: row.meta_description,
        updatedAt: row.updated_at.toISOString(),
        related: related.map((item) => toCard(item, media)),
      };
    });
  }

  /** The owner's spotlighted products, for the home page display section. */
  async function getSpotlight(): Promise<SpotlightProduct[]> {
    return anon(async (client) => {
      const spotlighted = await rows<ProductRow>(
        client,
        `${PRODUCT_BASE} where p.spotlight order by p.sort_rank asc, p.id asc`,
      );
      if (!spotlighted.length) return [];
      const ids = spotlighted.map((row) => row.id);
      // Only the first video per product (lowest sort_order) plays on the home page itself;
      // the rest stay on the product page.
      const firstVideos = await rows<{
        product_id: number;
        id: number;
        title: string;
        description: string | null;
        storage_path: string;
        poster_path: string;
        aspect: ProductVideo['aspect'];
        duration_seconds: number;
        transcript: string | null;
        created_at: Date;
      }>(
        client,
        `select distinct on (product_id) product_id, id, title, description, storage_path, poster_path,
                aspect, duration_seconds, transcript, created_at
         from public.public_product_videos
         where product_id = any($1::bigint[])
         order by product_id, sort_order, id`,
        [ids],
      );
      const videoByProduct = new Map(
        firstVideos
          .map((videoRow) => {
            const url = video.videoUrl(videoRow.storage_path);
            if (!url) return null;
            const item: ProductVideo = {
              id: videoRow.id,
              title: videoRow.title,
              description: videoRow.description,
              url,
              poster: media.imageSet(videoRow.poster_path),
              aspect: videoRow.aspect,
              durationSeconds: videoRow.duration_seconds,
              transcript: videoRow.transcript,
              uploadedAt: videoRow.created_at.toISOString(),
            };
            return [videoRow.product_id, item] as const;
          })
          .filter((entry): entry is readonly [number, ProductVideo] => entry !== null),
      );
      return spotlighted.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        url: productPath(row.category_slug, row.subcategory_slug, row.slug),
        smallDescription: row.small_description,
        image: media.imageSet(row.image),
        video: videoByProduct.get(row.id) ?? null,
      }));
    });
  }

  async function getMenu(): Promise<MenuCategory[]> {
    return anon(async (client) => {
      const categories = await rows<CategoryRow>(
        client,
        'select id, name, slug from public.public_categories order by sort_order, name',
      );
      const subcategories = await rows<CategoryRow>(
        client,
        'select id, name, slug, category_id from public.public_subcategories order by sort_order, name',
      );
      return categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        subcategories: subcategories
          .filter((sub) => sub.category_id === category.id)
          .map((sub) => ({ id: sub.id, name: sub.name, slug: sub.slug })),
      }));
    });
  }

  async function getCategories(): Promise<CategorySummary[]> {
    return anon(async (client) =>
      (
        await rows<CategoryRow>(
          client,
          'select * from public.public_categories order by sort_order, name',
        )
      ).map((row) => toCategory(row, media)),
    );
  }

  async function getCategory(slug: string): Promise<CategoryPage | null> {
    return anon(async (client) => {
      const [category] = await rows<CategoryRow>(
        client,
        'select * from public.public_categories where slug = $1',
        [slug],
      );
      if (!category) return null;
      const subcategories = await rows<CategoryRow>(
        client,
        'select * from public.public_subcategories where category_id = $1 order by sort_order, name',
        [category.id],
      );
      return {
        category: {
          ...toCategory(category, media),
          metaTitle: category.meta_title,
          metaDescription: category.meta_description,
        },
        subcategories: subcategories.map((row) => toSubcategory(row, media)),
      };
    });
  }

  async function getSubcategory(
    categorySlug: string,
    slug: string,
  ): Promise<SubcategoryPage | null> {
    return anon(async (client) => {
      const [sub] = await rows<CategoryRow>(
        client,
        'select * from public.public_subcategories where slug = $1 and category_slug = $2',
        [slug, categorySlug],
      );
      if (!sub) return null;
      const siblings = await rows<CategoryRow>(
        client,
        'select * from public.public_subcategories where category_id = $1 order by sort_order, name',
        [sub.category_id],
      );
      return {
        subcategory: {
          ...toSubcategory(sub, media),
          metaTitle: sub.meta_title,
          metaDescription: sub.meta_description,
        },
        siblings: siblings.map((row) => toSubcategory(row, media)),
      };
    });
  }

  async function getHome(): Promise<HomeData> {
    return anon(async (client) => {
      const banners = await rows<{
        id: number;
        name: string | null;
        description: string | null;
        link: string | null;
        image: string;
      }>(client, 'select * from public.public_banners order by sort_order, id limit 3');
      const categories = await rows<CategoryRow>(
        client,
        'select * from public.public_categories order by sort_order, name',
      );
      const newest = await rows<ProductRow>(
        client,
        `${PRODUCT_BASE} order by p.created_at desc, p.id desc limit 10`,
      );
      const featured = await rows<ProductRow>(
        client,
        `${PRODUCT_BASE} where p.featured order by p.updated_at desc limit 10`,
      );
      const recommended = await rows<ProductRow>(
        client,
        `${PRODUCT_BASE} order by ${SORTS.recommended} limit 12`,
      );
      const homeRows: HomeData['rows'] = [];
      for (const slug of HOME_ROW_CATEGORIES) {
        const category = categories.find((row) => row.slug === slug);
        if (!category) continue;
        const products = await rows<ProductRow>(
          client,
          `${PRODUCT_BASE} where p.category_slug = $1 order by p.featured desc, p.created_at desc limit 5`,
          [slug],
        );
        if (products.length) {
          homeRows.push({
            category: toCategory(category, media),
            products: products.map((row) => toCard(row, media)),
          });
        }
      }
      return {
        banners: banners
          .map((banner): Banner | null => {
            const image = media.imageSet(banner.image);
            return image
              ? {
                  id: banner.id,
                  name: banner.name,
                  description: banner.description,
                  link: banner.link,
                  image,
                }
              : null;
          })
          .filter((banner) => banner !== null),
        categories: categories.map((row) => toCategory(row, media)),
        newProducts: newest.map((row) => toCard(row, media)),
        featured: featured.map((row) => toCard(row, media)),
        spotlight: await getSpotlight(),
        recommended: recommended.map((row) => toCard(row, media)),
        rows: homeRows,
      };
    });
  }

  async function getRegions(): Promise<ShippingRegion[]> {
    return anon(async (client) =>
      (
        await rows<{ id: number; region_name: string; description: string | null; price: string }>(
          client,
          'select * from public.public_shipping_regions order by sort_order, region_name',
        )
      ).map((row) => ({
        id: row.id,
        name: row.region_name,
        description: row.description,
        price: row.price,
      })),
    );
  }

  async function getFaqs(): Promise<Faq[]> {
    return anon(async (client) =>
      rows<Faq & Record<string, unknown>>(
        client,
        'select id, question, answer from public.public_faqs order by sort_order, id',
      ),
    );
  }

  async function getPage(kind: string): Promise<ContentPage | null> {
    return anon(async (client) => {
      const [page] = await rows<{
        kind: string;
        name: string;
        slug: string;
        body: string | null;
        meta_title: string | null;
        meta_description: string | null;
        updated_at: Date;
      }>(client, 'select * from public.public_pages where kind = $1', [kind]);
      if (!page) return null;
      return {
        kind: page.kind,
        name: page.name,
        slug: page.slug,
        body: page.body ? sanitizeRichText(page.body) : null,
        metaTitle: page.meta_title,
        metaDescription: page.meta_description,
        updatedAt: page.updated_at.toISOString(),
      };
    });
  }

  async function findRedirect(path: string): Promise<string | null> {
    return anon(async (client) => {
      const [row] = await rows<{ to_path: string }>(
        client,
        'select to_path from public.public_redirects where from_path = $1',
        [path],
      );
      return row?.to_path ?? null;
    });
  }

  async function getSitemap(): Promise<SitemapEntry[]> {
    return anon(async (client) => {
      const entries = await rows<{ path: string; updated_at: Date }>(
        client,
        `select '/collection/' || slug as path, updated_at from public.public_categories
         union all
         select '/collection/' || category_slug || '/' || slug, updated_at from public.public_subcategories
         union all
         select '/collection/' || category_slug || '/' || subcategory_slug || '/product/' || slug, updated_at
           from public.public_products
         order by 1`,
      );
      return entries.map((entry) => ({
        path: entry.path,
        updatedAt: entry.updated_at.toISOString(),
      }));
    });
  }

  return {
    listProducts,
    getProduct,
    getMenu,
    getCategories,
    getCategory,
    getSubcategory,
    getHome,
    getSpotlight,
    getRegions,
    getFaqs,
    getPage,
    findRedirect,
    getSitemap,
  };
}

export type Catalogue = ReturnType<typeof createCatalogue>;
