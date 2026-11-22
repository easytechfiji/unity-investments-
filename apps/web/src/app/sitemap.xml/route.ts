import { api } from '../../lib/api';
import { SITE_URL } from '../../lib/config';

// sitemap.xml, built from the database so new products appear without editing files.
// Rendered on request (not at build time), so building does not need the API running.
export const dynamic = 'force-dynamic';
const STATIC_PAGES = [
  '/',
  '/collection',
  '/products',
  '/about_us',
  '/faqs',
  '/contact_us',
  '/delivery',
  '/privacy',
  '/sitemap',
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function GET() {
  const entries = await api.sitemap();
  const now = new Date().toISOString();
  const urls = [...STATIC_PAGES.map((path) => ({ path, updatedAt: now })), ...entries];
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (entry) =>
        `  <url><loc>${escapeXml(`${SITE_URL}${entry.path}`)}</loc><lastmod>${entry.updatedAt}</lastmod></url>`,
    ),
    '</urlset>',
  ].join('\n');
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
