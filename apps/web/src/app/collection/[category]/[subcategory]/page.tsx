import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Breadcrumbs } from '../../../../components/Breadcrumbs';
import { Listing } from '../../../../components/Listing';
import { api } from '../../../../lib/api';
import { apiParams, isFiltered, listingHref, readListingParams } from '../../../../lib/listing';
import { pageMetadata } from '../../../../lib/seo';

interface Props {
  params: Promise<{ category: string; subcategory: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function load(category: string, subcategory: string) {
  const page = await api.subcategory(category, subcategory);
  if (page) return page;
  const target = await api.redirect(`/collection/${category}/${subcategory}`);
  if (target) permanentRedirect(target);
  notFound();
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { category, subcategory } = await params;
  const listing = readListingParams(await searchParams);
  const page = await api.subcategory(category, subcategory);
  if (!page) return { title: 'Page not found' };
  const sub = page.subcategory;
  return pageMetadata({
    title: sub.metaTitle ?? `${sub.name}${listing.page > 1 ? `, page ${listing.page}` : ''}`,
    description:
      sub.metaDescription ??
      sub.description ??
      `${sub.name} in our ${sub.categoryName.toLowerCase()} range. Order online from our shop in Nakasi, Fiji.`,
    path: listingHref(
      `/collection/${category}/${subcategory}`,
      { ...listing, sort: null, min: null, max: null, inStock: false, q: null },
      {},
    ),
    noindex: isFiltered(listing),
    image: sub.image?.src,
  });
}

export default async function SubcategoryPage({ params, searchParams }: Props) {
  const { category, subcategory } = await params;
  const listing = readListingParams(await searchParams);
  const page = await load(category, subcategory);
  const result = await api.products(apiParams(listing, { category, subcategory }));
  const sub = page.subcategory;
  const path = `/collection/${category}/${subcategory}`;

  return (
    <div className="wrap page">
      <Breadcrumbs
        items={[
          { name: 'All categories', path: '/collection' },
          { name: sub.categoryName, path: `/collection/${category}` },
          { name: sub.name, path },
        ]}
      />
      <h1>{sub.name}</h1>
      {sub.description ? <p className="intro">{sub.description}</p> : null}
      <Listing
        path={path}
        params={listing}
        result={result}
        subcategories={page.siblings.map((item) => ({
          name: item.name,
          href: `/collection/${category}/${item.slug}`,
          current: item.slug === subcategory,
        }))}
      />
    </div>
  );
}
