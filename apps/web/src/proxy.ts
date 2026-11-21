import { NextResponse, type NextRequest } from 'next/server';

// Runs before every page. It:
// 1. sends www visitors to the main address with a 301, so Google sees one site;
// 2. makes a fresh random nonce and a strict Content Security Policy, so only
//    scripts this server rendered (and PayPal and Turnstile) can run;
// 3. marks every page noindex unless this is production.

const SITE_URL = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const API_ORIGIN = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').origin;
const MEDIA_ORIGIN = process.env.MEDIA_ORIGIN ? new URL(process.env.MEDIA_ORIGIN).origin : null;
const ALLOW_INDEXING = process.env.ALLOW_INDEXING === 'true';
const REPORT_ONLY = process.env.CSP_REPORT_ONLY === 'true';
const isDev = process.env.NODE_ENV === 'development';

function contentSecurityPolicy(nonce: string): string {
  const paypal = 'https://*.paypal.com https://*.paypalobjects.com';
  const turnstile = 'https://challenges.cloudflare.com';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Development tools add inline styles; production does not need them.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    `img-src 'self' data: blob: ${API_ORIGIN} ${MEDIA_ORIGIN ?? ''} ${paypal}`.trim(),
    // Video is served straight from Storage (or the API in development), never through a third party.
    `media-src 'self' ${API_ORIGIN} ${MEDIA_ORIGIN ?? ''}`.trim(),
    "font-src 'self'",
    `connect-src 'self' ${API_ORIGIN} ${paypal} ${turnstile}`,
    `frame-src ${paypal} ${turnstile}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(SITE_URL.startsWith('https://') ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

export function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const canonicalHost = new URL(SITE_URL).host;
  if (host.startsWith('www.') && host.slice(4) === canonicalHost) {
    const target = new URL(request.nextUrl.pathname + request.nextUrl.search, SITE_URL);
    return NextResponse.redirect(target, 301);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = contentSecurityPolicy(nonce);
  const header = REPORT_ONLY ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(header, policy);
  if (!ALLOW_INDEXING) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const config = {
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|brand/|favicon.ico|icon.png|apple-icon.png|opengraph-image.png).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
