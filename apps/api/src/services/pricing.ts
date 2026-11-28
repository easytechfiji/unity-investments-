import {
  centsToDecimal,
  convertCents,
  productPath,
  toCents,
  type CartLine,
  type LineProblem,
  type PricedCart,
  type PricedLine,
} from '@od/shared';
import type { AppConfig } from '../config/env.js';
import { paypalEnabled } from '../config/env.js';
import { rows, type Client } from '../db.js';
import { HttpError } from '../lib/errors.js';
import type { MediaStore } from '../lib/media.js';

// Prices, stock and delivery are always worked out here, from the database.
// Nothing the browser sends about money is ever used.

interface ProductRow {
  id: number;
  name: string;
  slug: string;
  sku: string | null;
  type: 'simple' | 'variable';
  original_price: string;
  sale_price: string | null;
  stock: number;
  availability: 'in_stock' | 'arriving_soon';
  image: string | null;
  category_slug: string;
  subcategory_slug: string;
  [key: string]: unknown;
}

interface VariantRow {
  id: number;
  product_id: number;
  sku: string | null;
  price: string;
  stock: number;
  colour: string | null;
  size: string | null;
  [key: string]: unknown;
}

export interface PricedLineInternal extends PricedLine {
  unitCents: number;
}

export interface PricedCartInternal {
  lines: PricedLineInternal[];
  subtotalCents: number;
  ok: boolean;
}

/** Same line added twice becomes one line with the quantities added together. */
export function mergeLines(lines: CartLine[]): CartLine[] {
  const merged = new Map<string, CartLine>();
  for (const line of lines) {
    const key = `${line.productId}:${line.variantId ?? ''}`;
    const existing = merged.get(key);
    if (existing) existing.quantity = Math.min(existing.quantity + line.quantity, 999);
    else merged.set(key, { ...line });
  }
  return [...merged.values()];
}

/**
 * Prices cart lines from the database. With `lock`, the product and variant rows
 * are locked until the transaction ends, so stock cannot change between the
 * check and the order being saved.
 */
export async function priceLines(
  client: Client,
  media: MediaStore,
  input: CartLine[],
  { lock }: { lock: boolean },
): Promise<PricedCartInternal> {
  const lines = mergeLines(input);
  const productIds = [...new Set(lines.map((line) => line.productId))];
  const variantIds = lines.map((line) => line.variantId).filter((id): id is number => id !== null);
  const lockSql = lock ? 'for update of p' : '';

  // Visible means: product on and not deleted, in a category and subcategory that are on.
  const products = await rows<ProductRow>(
    client,
    `select p.id, p.name, p.slug, p.sku, p.type, p.original_price, p.sale_price, p.stock, p.availability, p.image,
            c.slug as category_slug, s.slug as subcategory_slug
     from public.products p
     join public.categories c on c.id = p.category_id and c.status and c.deleted_at is null
     join public.subcategories s on s.id = p.subcategory_id and s.status and s.deleted_at is null
     where p.id = any($1::bigint[]) and p.status and p.deleted_at is null
     ${lockSql}`,
    [productIds],
  );
  const variants = variantIds.length
    ? await rows<VariantRow>(
        client,
        `select v.id, v.product_id, v.sku, v.price, v.stock, colour.name as colour, size.name as size
         from public.product_variants v
         left join public.attribute_values colour on colour.id = v.color_id
         left join public.attribute_values size on size.id = v.size_id
         where v.id = any($1::bigint[])
         ${lock ? 'for update of v' : ''}`,
        [variantIds],
      )
    : [];
  const [sale] = await rows<{ sale_on: boolean }>(
    client,
    'select coalesce(active and ends_at > now(), false) as sale_on from public.sale_settings where id = 1',
  );
  const saleOn = sale?.sale_on ?? false;

  const priced = lines.map((line): PricedLineInternal => {
    const product = products.find((row) => row.id === line.productId);
    const base = {
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
      variantLabel: null,
      sku: null,
      url: null,
      image: null,
      unitPrice: null,
      lineTotal: null,
      available: 0,
      unitCents: 0,
    };
    const fail = (
      problem: LineProblem,
      extra: Partial<PricedLineInternal> = {},
    ): PricedLineInternal => ({
      ...base,
      name: product?.name ?? 'Product no longer available',
      problem,
      ...extra,
    });
    if (!product) return fail('not_found');

    const shared = {
      name: product.name,
      url: productPath(product.category_slug, product.subcategory_slug, product.slug),
      image: media.imageSet(product.image),
    };

    let unitCents: number;
    let available: number;
    let sku = product.sku;
    let variantLabel: string | null = null;
    if (product.type === 'variable') {
      if (line.variantId === null) return fail('choose_variant', shared);
      const variant = variants.find(
        (row) => row.id === line.variantId && row.product_id === product.id,
      );
      if (!variant) return fail('variant_not_found', shared);
      unitCents = toCents(variant.price);
      available = variant.stock;
      sku = variant.sku ?? sku;
      variantLabel = [variant.colour, variant.size].filter(Boolean).join(', ') || null;
    } else {
      if (line.variantId !== null) return fail('variant_not_found', shared);
      unitCents = toCents(
        saleOn && product.sale_price ? product.sale_price : product.original_price,
      );
      available = product.stock;
    }

    const result: PricedLineInternal = {
      ...base,
      ...shared,
      sku,
      variantLabel,
      available,
      unitCents,
      unitPrice: centsToDecimal(unitCents),
      lineTotal: centsToDecimal(unitCents * line.quantity),
      problem: null,
    };
    // Not arrived yet: quotation only, whatever price or stock the row holds.
    if (product.availability === 'arriving_soon')
      return { ...result, unitPrice: null, lineTotal: null, problem: 'arriving_soon' };
    if (unitCents === 0)
      return { ...result, unitPrice: null, lineTotal: null, problem: 'quote_only' };
    if (available <= 0) return { ...result, problem: 'out_of_stock' };
    if (available < line.quantity) return { ...result, problem: 'not_enough_stock' };
    return result;
  });

  const ok = priced.length > 0 && priced.every((line) => line.problem === null);
  const subtotalCents = priced
    .filter((line) => line.problem === null)
    .reduce((sum, line) => sum + line.unitCents * line.quantity, 0);
  return { lines: priced, subtotalCents, ok };
}

export interface DeliveryChoice {
  deliveryMethod?: 'click_and_collect' | 'shipping';
  regionId?: number;
}

export interface Totals {
  shippingCents: number | null;
  regionName: string | null;
  taxCents: number;
  totalCents: number;
}

export async function deliveryAndTotals(
  client: Client,
  config: AppConfig,
  subtotalCents: number,
  choice: DeliveryChoice,
): Promise<Totals> {
  let shippingCents: number | null = null;
  let regionName: string | null = null;
  if (choice.deliveryMethod === 'click_and_collect') {
    shippingCents = 0;
  } else if (choice.deliveryMethod === 'shipping' && choice.regionId !== undefined) {
    const [region] = await rows<{ region_name: string; price: string }>(
      client,
      'select region_name, price from public.shipping_regions where id = $1 and status',
      [choice.regionId],
    );
    if (!region)
      throw new HttpError(400, 'invalid_region', 'Choose a delivery region from the list.');
    shippingCents = toCents(region.price);
    regionName = region.region_name;
  }
  // Tax is added on top of the subtotal when switched on. Rounded half up to the cent.
  const taxCents = config.TAX_ENABLED ? Math.round((subtotalCents * config.TAX_RATE) / 100) : 0;
  return {
    shippingCents,
    regionName,
    taxCents,
    totalCents: subtotalCents + (shippingCents ?? 0) + taxCents,
  };
}

export function paypalCharge(
  config: AppConfig,
  fxRate: string | null,
  totalCents: number,
): { currency: string; cents: number; rate: string } | null {
  if (!paypalEnabled(config) || !fxRate || !config.PAYPAL_CURRENCY) return null;
  return {
    currency: config.PAYPAL_CURRENCY,
    cents: convertCents(totalCents, fxRate),
    rate: fxRate,
  };
}

export function toPublicCart(
  config: AppConfig,
  cart: PricedCartInternal,
  totals: Totals,
  fxRate: string | null,
): PricedCart {
  const charge = paypalCharge(config, fxRate, totals.totalCents);
  return {
    lines: cart.lines.map(({ unitCents: _unitCents, ...line }) => line),
    currency: config.SHOP_CURRENCY,
    subtotal: centsToDecimal(cart.subtotalCents),
    shipping: totals.shippingCents === null ? null : centsToDecimal(totals.shippingCents),
    tax: centsToDecimal(totals.taxCents),
    total: centsToDecimal(totals.totalCents),
    paypal: charge
      ? { currency: charge.currency, amount: centsToDecimal(charge.cents), rate: charge.rate }
      : null,
    ok: cart.ok,
  };
}
