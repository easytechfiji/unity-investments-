import type { Metadata } from 'next';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { Listing } from '../../components/Listing';
import { api } from '../../lib/api';
import { apiParams, isFiltered, listingHref, readListingParams } from '../../lib/listing';
import { pageMetadata } from '../../lib/seo';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// The full catalogue, in the Recommended order by default. Unlike /search
// (which answers a typed query and is never indexed), this is the catalogue's
// own clean, indexable address: the plain default view here is the one page
// Google should index, and any sort or filter choice drops it to noindex,follow.
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const listing = readListingParams(await searchParams);
  return pageMetadata({
    title: listing.page > 1 ? `All products, page ${listing.page}` : 'All products',
    description: 'Every product we sell: double bed bedsheets and bedding sets.',
    path: listingHref(
      '/products',
      { ...listing, sort: null, min: null, max: null, inStock: false, q: null },
      {},
    ),
    noindex: isFiltered(listing),
  });
}

export default async function ProductsPage({ searchParams }: Props) {
  const listing = readListingParams(await searchParams);
  const result = await api.products(apiParams(listing, {}));
  return (
    <div className="wrap page">
      <Breadcrumbs items={[{ name: 'All products', path: '/products' }]} />
      <h1>All products</h1>
      <Listing path="/products" params={listing} result={result} />
    </div>
  );
}
