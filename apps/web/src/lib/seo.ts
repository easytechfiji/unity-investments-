import type { Metadata } from 'next';
import { ALLOW_INDEXING, SITE_NAME, SITE_URL } from './config';

/** Trims text to a length without cutting a word in half. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : cut.length)}.`;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

interface PageMeta {
  title: string;
  description: string;
  path: string;
  /** Filtered, sorted and search pages: keep out of Google but follow their links. */
  noindex?: boolean;
  image?: string | null;
}

/** Title, description, canonical and social tags for one page. */
export function pageMetadata({ title, description, path, noindex, image }: PageMeta): Metadata {
  const url = `${SITE_URL}${path}`;
  const index = ALLOW_INDEXING && !noindex;
  return {
    title,
    description: clip(description, 155),
    alternates: { canonical: url },
    robots: { index, follow: true },
    openGraph: {
      title,
      description: clip(description, 155),
      url,
      siteName: SITE_NAME,
      locale: 'en_FJ',
      type: 'website',
      ...(image ? { images: [{ url: image }] } : {}),
    },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}
