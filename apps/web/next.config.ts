import type { NextConfig } from 'next';

// Security headers for every response. The Content Security Policy is added
// per request in src/proxy.ts, because it carries a fresh nonce each time.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://www.paypal.com")',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
];

// Addresses from the previous Unity Investment site (the VAULT catalogue) get one
// permanent (301) redirect to their new home. It showed categories at /category/<slug>.
// Only bedding is sold now, so the other old categories go to the list of all categories.
// The first rule that matches wins.
const legacyRedirects: [string, string][] = [
  ['/category/blankets-bedding', '/collection/blankets-bedding'],
  ['/category/:slug', '/collection'],
];

const nextConfig: NextConfig = {
  // Browser tests build into their own folder so they never clash with development.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  poweredByHeader: false,
  // experimental.inlineCss was tried and rejected: Next.js 16 does not put the CSP
  // nonce on the inline style tag, so the strict policy blocks every style.
  reactStrictMode: true,
  headers() {
    return Promise.resolve([
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/brand/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }],
      },
    ]);
  },
  redirects() {
    return Promise.resolve(
      legacyRedirects.map(([source, destination]) => ({
        source,
        destination,
        statusCode: 301 as const,
      })),
    );
  },
};

export default nextConfig;
