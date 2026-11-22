import { sanitizeRichText } from '@od/shared/sanitize';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { api } from '../../lib/api';
import { pageMetadata } from '../../lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const page = await api.page('about');
  return pageMetadata({
    title: page?.metaTitle ?? 'About us',
    description:
      page?.metaDescription ??
      'Unity Investment sells bedsheets and bedding sets from Nakasi, Fiji.',
    path: '/about_us',
  });
}

export default async function AboutPage() {
  const [page, site] = await Promise.all([api.page('about'), api.site()]);
  return (
    <div className="wrap page prose">
      <Breadcrumbs items={[{ name: 'About us', path: '/about_us' }]} />
      <h1>{page?.name ?? 'About us'}</h1>
      {page?.body ? (
        <div dangerouslySetInnerHTML={{ __html: sanitizeRichText(page.body) }} />
      ) : (
        // Until the owner writes this page, show only plain facts.
        <p>
          {site.siteName} sells double bed bedsheets and bedding sets from{' '}
          {site.address ?? 'Nakasi, Fiji'}.
        </p>
      )}
      <p>
        <Link href="/contact_us">Contact us</Link> or{' '}
        <Link href="/collection">browse the full range</Link>.
      </p>
    </div>
  );
}
