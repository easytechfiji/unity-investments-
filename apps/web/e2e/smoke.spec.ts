import { expect, test } from '@playwright/test';

const PRODUCT =
  '/collection/office-furniture/office-chairs-range/product/ergonomic-mesh-office-chair';

test('pages are rendered on the server with one h1, the Fiji language tag and a canonical link', async ({
  page,
  request,
}) => {
  for (const path of [
    '/',
    '/collection',
    '/collection/road-safety',
    PRODUCT,
    '/delivery',
    '/faqs',
    '/contact_us',
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-FJ');
    await expect(page.locator('h1'), path).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]'), path).toHaveCount(1);
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description?.length ?? 0, path).toBeGreaterThan(40);
    expect(description?.length ?? 0, path).toBeLessThanOrEqual(155);
  }
  // Google must see the product name and price without running JavaScript.
  const html = await (await request.get(PRODUCT)).text();
  expect(html).toContain('Ergonomic mesh office chair');
  expect(html).toContain('FJ$389.00');
});

test('security headers and a fresh nonce on every page', async ({ request }) => {
  const first = await request.get('/');
  const second = await request.get('/');
  const csp = first.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  expect(csp).not.toBe(second.headers()['content-security-policy']);
  expect(first.headers()['x-content-type-options']).toBe('nosniff');
  expect(first.headers()['x-powered-by']).toBeUndefined();
  // Not production, so nothing may be indexed.
  expect(first.headers()['x-robots-tag']).toContain('noindex');
});

test('structured data for products and breadcrumbs', async ({ page }) => {
  await page.goto(PRODUCT);
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const data = blocks.map(
    (text) =>
      JSON.parse(text) as {
        '@type': string;
        offers?: { lowPrice?: string; priceCurrency?: string };
      },
  );
  const product = data.find((item) => item['@type'] === 'Product');
  expect(product?.offers).toMatchObject({ lowPrice: '389.00', priceCurrency: 'FJD' });
  expect(data.some((item) => item['@type'] === 'BreadcrumbList')).toBe(true);
});

test('price on request products have no invented offer', async ({ page }) => {
  await page.goto('/collection/office-furniture/desks-and-counters/product/reception-counter');
  await expect(page.getByText('Price on request').first()).toBeVisible();
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const product = blocks
    .map((text) => JSON.parse(text) as Record<string, unknown>)
    .find((item) => item['@type'] === 'Product');
  expect(product && 'offers' in product).toBe(false);
});

test('old addresses redirect once with a 301 and missing pages are real 404s', async ({
  request,
}) => {
  const old = await request.get('/category/blankets-bedding', { maxRedirects: 0 });
  expect(old.status()).toBe(301);
  expect(old.headers().location).toMatch(/\/collection\/blankets-bedding$/);
  const removed = await request.get('/category/electronics', { maxRedirects: 0 });
  expect(removed.status()).toBe(301);
  expect(removed.headers().location).toMatch(/\/collection$/);
  for (const path of ['/collection/no-such-category', `${PRODUCT}-gone`, '/no-such-page']) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  // A product reached through the wrong category is sent to its one real address.
  const wrong = await request.get(
    '/collection/road-safety/safety-tape/product/ergonomic-mesh-office-chair',
    { maxRedirects: 0 },
  );
  expect([301, 308]).toContain(wrong.status());
  expect(wrong.headers().location).toContain(
    '/collection/office-furniture/office-chairs-range/product/ergonomic-mesh-office-chair',
  );
});

test('sitemap.xml lists products and robots.txt blocks a non-production site', async ({
  request,
}) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain(
    '/collection/road-safety/safety-tape/product/barrier-tape-red-white-100m</loc>',
  );
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /');
});
