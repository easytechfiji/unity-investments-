import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { ProductImage } from '../../components/ProductImage';
import { api } from '../../lib/api';
import { pageMetadata } from '../../lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'All categories',
  description:
    'Every product range we sell: double bed bedsheets and bedding sets, from our shop in Nakasi.',
  path: '/collection',
});

export default async function CollectionPage() {
  const menu = await api.menu();
  const categories = await api.categories();
  return (
    <div className="wrap page">
      <Breadcrumbs items={[{ name: 'All categories', path: '/collection' }]} />
      <h1>All categories</h1>
      <ul className="tiles">
        {categories.map((category, index) => {
          const subs = menu.find((item) => item.id === category.id)?.subcategories ?? [];
          return (
            <li key={category.id}>
              <div className={`tile${category.image ? '' : ' tile-text'}`}>
                {category.image ? (
                  <Link href={`/collection/${category.slug}`}>
                    <ProductImage
                      image={category.image}
                      alt=""
                      sizes="(min-width: 1024px) 240px, 50vw"
                      priority={index < 2}
                    />
                  </Link>
                ) : null}
                <Link className="tile-name" href={`/collection/${category.slug}`}>
                  {category.name}
                </Link>
                {subs.length ? (
                  <ul className="tile-subs">
                    {subs.map((sub) => (
                      <li key={sub.id}>
                        <Link href={`/collection/${category.slug}/${sub.slug}`}>{sub.name}</Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
