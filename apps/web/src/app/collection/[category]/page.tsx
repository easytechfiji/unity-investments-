import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { Listing } from '../../../components/Listing';
import { api } from '../../../lib/api';
import { apiParams, isFiltered, listingHref, readListingParams } from '../../../lib/listing';
import { pageMetadata } from '../../../lib/seo';

interface Props {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function load(slug: string) {
  const page = await api.category(slug);
  if (page) return page;
  // An old or renamed address may have a redirect set up in the admin.
  const target = await api.redirect(`/collection/${slug}`);
  if (target) permanentRedirect(target);
  notFound();
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { category } = await params;
  const listing = readListingParams(await searchParams);
  const page = await api.category(category);
  if (!page) return { title: 'Page not found' };
  const name = page.category.name;
  return pageMetadata({
    title: page.category.metaTitle ?? `${name}${listing.page > 1 ? `, page ${listing.page}` : ''}`,
    description:
      page.category.metaDescription ??
      page.category.description ??
      `Shop ${name.toLowerCase()} online from our shop in Nakasi, Fiji.`,
    path: listingHref(
      `/collection/${category}`,
      { ...listing, sort: null, min: null, max: null, inStock: false, q: null },
      {},
    ),
    noindex: isFiltered(listing),
    image: page.category.image?.src,
  });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category } = await params;
  const listing = readListingParams(await searchParams);
  const page = await load(category);
  const result = await api.products(apiParams(listing, { category }));
  const path = `/collection/${category}`;

  return (
    <div className="wrap page">
      <Breadcrumbs
        items={[
          { name: 'All categories', path: '/collection' },
          { name: page.category.name, path },
        ]}
      />
      <h1>{page.category.name}</h1>
      {page.category.description ? <p className="intro">{page.category.description}</p> : null}
      {page.subcategories.length > 0 ? (
        <ul className="subcat-links" aria-label={`${page.category.name} ranges`}>
          {page.subcategories.map((sub) => (
            <li key={sub.id}>
              <Link href={`${path}/${sub.slug}`}>{sub.name}</Link>
            </li>
          ))}
        </ul>
      ) : null}
      <Listing
        path={path}
        params={listing}
        result={result}
        subcategories={page.subcategories.map((sub) => ({
          name: sub.name,
          href: `${path}/${sub.slug}`,
        }))}
      />
    </div>
  );
}
