import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { api } from '../../lib/api';
import { pageMetadata } from '../../lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Sitemap',
  description: 'Every category and range on the Unity Investment website.',
  path: '/sitemap',
});

export default async function SitemapPage() {
  const menu = await api.menu();
  return (
    <div className="wrap page prose">
      <Breadcrumbs items={[{ name: 'Sitemap', path: '/sitemap' }]} />
      <h1>Sitemap</h1>
      <h2>Products</h2>
      <ul>
        {menu.map((category) => (
          <li key={category.id}>
            <Link href={`/collection/${category.slug}`}>{category.name}</Link>
            <ul>
              {category.subcategories.map((sub) => (
                <li key={sub.id}>
                  <Link href={`/collection/${category.slug}/${sub.slug}`}>{sub.name}</Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <h2>Information</h2>
      <ul>
        <li>
          <Link href="/about_us">About us</Link>
        </li>
        <li>
          <Link href="/delivery">Delivery and pickup</Link>
        </li>
        <li>
          <Link href="/faqs">FAQs</Link>
        </li>
        <li>
          <Link href="/contact_us">Contact us</Link>
        </li>
        <li>
          <Link href="/privacy">Privacy</Link>
        </li>
      </ul>
    </div>
  );
}
