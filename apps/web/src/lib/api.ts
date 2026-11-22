import type {
  CategoryPage,
  CategorySummary,
  ContentPage,
  Faq,
  HomeData,
  MenuCategory,
  ProductDetail,
  ProductListResult,
  ShippingRegion,
  SiteInfo,
  SitemapEntry,
  SpotlightProduct,
  SubcategoryPage,
} from '@od/shared';
import { API_URL } from './config';

// Server side reads from the API. Results are cached for 60 seconds, so an
// admin change shows on the storefront within a minute.

class ApiUnavailableError extends Error {
  override name = 'ApiUnavailableError';
}

async function get<T>(path: string, revalidate = 60): Promise<T | null> {
  const response = await fetch(`${API_URL}/v1${path}`, {
    next: { revalidate },
    headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiUnavailableError(`API returned ${response.status} for ${path}`);
  return (await response.json()) as T;
}

async function getRequired<T>(path: string, revalidate = 60): Promise<T> {
  const result = await get<T>(path, revalidate);
  if (result === null) throw new ApiUnavailableError(`API returned nothing for ${path}`);
  return result;
}

export const api = {
  site: () => getRequired<SiteInfo>('/site'),
  menu: () => getRequired<MenuCategory[]>('/menu'),
  home: () => getRequired<HomeData>('/home'),
  spotlight: () => getRequired<SpotlightProduct[]>('/spotlight'),
  categories: () => getRequired<CategorySummary[]>('/categories'),
  category: (slug: string) => get<CategoryPage>(`/categories/${encodeURIComponent(slug)}`),
  subcategory: (category: string, slug: string) =>
    get<SubcategoryPage>(`/categories/${encodeURIComponent(category)}/${encodeURIComponent(slug)}`),
  products: (params: URLSearchParams) =>
    getRequired<ProductListResult>(`/products?${params.toString()}`),
  product: (slug: string) => get<ProductDetail>(`/products/${encodeURIComponent(slug)}`),
  regions: () => getRequired<ShippingRegion[]>('/regions'),
  faqs: () => getRequired<Faq[]>('/faqs'),
  page: (kind: string) => get<ContentPage>(`/pages/${kind}`),
  sitemap: () => getRequired<SitemapEntry[]>('/sitemap', 300),
  redirect: async (path: string) =>
    (await get<{ to: string | null }>(`/redirects?path=${encodeURIComponent(path)}`))?.to ?? null,
};
