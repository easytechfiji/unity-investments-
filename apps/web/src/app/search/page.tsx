import type { Metadata } from 'next';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { Listing } from '../../components/Listing';
import { api } from '../../lib/api';
import { apiParams, readListingParams } from '../../lib/listing';
import { pageMetadata } from '../../lib/seo';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = readListingParams(await searchParams);
  // Search result pages are never indexed (Appendix C), but their links are followed.
  return pageMetadata({
    title: q ? `Search results for ${q}` : 'All products',
    description: 'Search our range of bedsheets and bedding sets.',
    path: '/search',
    noindex: true,
  });
}

export default async function SearchPage({ searchParams }: Props) {
  const listing = readListingParams(await searchParams);
  const result = await api.products(apiParams(listing, {}));
  const heading = listing.q ? `Search results for "${listing.q}"` : 'All products';
  return (
    <div className="wrap page">
      <Breadcrumbs items={[{ name: listing.q ? 'Search' : 'All products', path: '/search' }]} />
      <h1>{heading}</h1>
      <Listing path="/search" params={listing} result={result} />
    </div>
  );
}
