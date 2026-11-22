// Addresses the storefront needs. Server code reads API_URL; browser code can
// only see NEXT_PUBLIC_ values, which are baked in at build time.

export const SITE_URL = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** Where the server fetches catalogue data from. */
export const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

/** Where the browser sends cart, checkout and form requests. */
export const PUBLIC_API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);

/** Staging and previews must never be indexed. Only production sets this to true. */
export const ALLOW_INDEXING = process.env.ALLOW_INDEXING === 'true';

export const SITE_NAME = 'Unity Investment';
