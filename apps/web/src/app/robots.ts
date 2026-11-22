import type { MetadataRoute } from 'next';
import { ALLOW_INDEXING, SITE_URL } from '../lib/config';

// Read the setting on each request, so the same build is safe on staging and production.
export const dynamic = 'force-dynamic';

// Production: allow public pages, block the shop flow, search results and
// filtered or sorted lists (Appendix C). Anything else (staging): block everything.
export default function robots(): MetadataRoute.Robots {
  if (!ALLOW_INDEXING) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/cart',
          '/checkout',
          '/order-confirmation',
          '/order-lookup',
          '/search',
          '/*?*sort=',
          '/*?*min=',
          '/*?*max=',
          '/*?*inStock=',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
