// Reading and writing the query string of product list pages:
// ?sort=price_asc&min=10&max=50&inStock=1&page=2

export const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price_asc', label: 'Price, low to high' },
  { value: 'price_desc', label: 'Price, high to low' },
  { value: 'name_asc', label: 'Name, A to Z' },
  { value: 'name_desc', label: 'Name, Z to A' },
  { value: 'newest', label: 'Newest first' },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]['value'];

/** The plain default order. Choosing it, or any filter, drops the page out of the clean indexable URL. */
export const DEFAULT_SORT: SortValue = 'recommended';

export interface ListingParams {
  sort: SortValue | null;
  min: string | null;
  max: string | null;
  inStock: boolean;
  page: number;
  q: string | null;
  category: string | null;
}

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const money = (value: string | undefined) =>
  value && /^\d{1,8}(\.\d{1,2})?$/.test(value) ? value : null;

export function readListingParams(raw: RawParams): ListingParams {
  const sort = first(raw.sort);
  const page = Number(first(raw.page));
  const q = first(raw.q)?.trim().slice(0, 100);
  const category = first(raw.category);
  return {
    sort: SORT_OPTIONS.some((option) => option.value === sort) ? (sort as SortValue) : null,
    min: money(first(raw.min)),
    max: money(first(raw.max)),
    inStock: first(raw.inStock) === '1',
    page: Number.isInteger(page) && page > 1 && page <= 500 ? page : 1,
    q: q ? q : null,
    category: category && /^[a-z0-9-]{1,200}$/.test(category) ? category : null,
  };
}

/**
 * Filters and a non-default sort make a page that Google should not index
 * (pagination alone is fine). Choosing the Recommended order explicitly is
 * the same page as the clean default address, so it does not count.
 */
export function isFiltered(params: ListingParams): boolean {
  return Boolean(
    (params.sort && params.sort !== DEFAULT_SORT) ||
    params.min ||
    params.max ||
    params.inStock ||
    params.q,
  );
}

export function apiParams(
  params: ListingParams,
  scope: { category?: string; subcategory?: string },
): URLSearchParams {
  const query = new URLSearchParams();
  const category = scope.category ?? params.category;
  if (category) query.set('category', category);
  if (scope.subcategory) query.set('subcategory', scope.subcategory);
  if (params.q) query.set('q', params.q);
  if (params.min) query.set('min', params.min);
  if (params.max) query.set('max', params.max);
  if (params.inStock) query.set('inStock', '1');
  if (params.sort) query.set('sort', params.sort);
  if (params.page > 1) query.set('page', String(params.page));
  return query;
}

/** A link to the same list with some parameters changed. */
export function listingHref(
  path: string,
  params: ListingParams,
  change: Partial<ListingParams>,
): string {
  const next = { ...params, ...change };
  const query = new URLSearchParams();
  if (next.q) query.set('q', next.q);
  if (next.category && path === '/search') query.set('category', next.category);
  if (next.sort) query.set('sort', next.sort);
  if (next.min) query.set('min', next.min);
  if (next.max) query.set('max', next.max);
  if (next.inStock) query.set('inStock', '1');
  if (next.page > 1) query.set('page', String(next.page));
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
