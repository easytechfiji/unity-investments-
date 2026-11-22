// Takes full page screenshots of the main storefront pages at 360, 768 and 1280
// pixels wide (Appendix A, "Checks before any page is called done").
//
//   node scripts/screenshots.mjs [base url]      default http://localhost:3000
//
// Images are written to .data/screenshots (gitignored).
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:3000';
const out = resolve(import.meta.dirname, '..', '.data', 'screenshots');
mkdirSync(out, { recursive: true });

const pages = {
  home: '/',
  collection: '/collection',
  category: '/collection/office-furniture',
  subcategory: '/collection/office-stationery/paper-and-notebooks',
  product: '/collection/office-furniture/office-chairs-range/product/ergonomic-mesh-office-chair',
  quote: '/collection/office-furniture/desks-and-counters/product/reception-counter',
  search: '/search?q=paper',
  delivery: '/delivery',
  contact: '/contact_us',
  notfound: '/collection/nothing-here',
};
const widths = (process.env.WIDTHS ?? '360,768,1280').split(',').map(Number);
const only = process.env.PAGES?.split(',');

const browser = await chromium.launch();
for (const width of widths) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  for (const [name, path] of Object.entries(pages)) {
    if (only && !only.includes(name)) continue;
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.screenshot({ path: join(out, `${name}-${width}.png`), fullPage: true });
  }
  await context.close();
}
await browser.close();
console.log(`Screenshots written to ${out}`);
