import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { api } from '../lib/api';
import { ALLOW_INDEXING, SITE_NAME, SITE_URL } from '../lib/config';
import '../styles/globals.css';

// Self hosted, Latin only, font-display swap (Appendix A).
const barlow = localFont({
  src: [
    { path: '../fonts/barlow-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/barlow-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-barlow',
  display: 'swap',
  fallback: ['Arial', 'sans-serif'],
});

const barlowSemi = localFont({
  src: [
    {
      path: '../fonts/barlow-semi-condensed-latin-700-normal.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-barlow-semi',
  display: 'swap',
  preload: false,
  fallback: ['Arial Narrow', 'Arial', 'sans-serif'],
});

// Display face for the home page headline only.
const dmSerif = localFont({
  src: [
    { path: '../fonts/dm-serif-display-latin-400-normal.woff2', weight: '400', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: 'Bedsheets and bedding sets from Nakasi, Fiji.',
  robots: { index: ALLOW_INDEXING, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#13649a',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading the request headers makes every page render per request, which
  // the per request CSP nonce needs (src/proxy.ts).
  await headers();
  const [site, menu] = await Promise.all([api.site(), api.menu()]);
  return (
    <html lang="en-FJ" className={`${barlow.variable} ${barlowSemi.variable} ${dmSerif.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <Header site={site} menu={menu} />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <Footer site={site} menu={menu} />
      </body>
    </html>
  );
}
