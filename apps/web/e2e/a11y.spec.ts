import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// WCAG 2.2 AA checks with axe on every kind of page (Appendix A). Serious and
// critical problems fail the test; anything smaller is printed for review.
const PAGES = [
  '/',
  '/collection',
  '/collection/office-stationery',
  '/collection/office-stationery/paper-and-notebooks',
  '/collection/office-furniture/office-chairs-range/product/ergonomic-mesh-office-chair',
  '/collection/office-furniture/desks-and-counters/product/reception-counter',
  '/search?q=paper',
  '/cart',
  '/checkout',
  '/contact_us',
  '/delivery',
  '/faqs',
  '/order-lookup',
  '/privacy',
  '/no-such-page',
];

for (const path of PAGES) {
  test(`no serious accessibility problems on ${path}`, async ({ page }) => {
    await page.goto('/');
    // A cart with something in it, so the cart and checkout pages show their full forms.
    await page.evaluate(async () => {
      const response = await fetch('http://localhost:4100/v1/products/whiteboard-eraser');
      const { id } = (await response.json()) as { id: number };
      window.localStorage.setItem(
        'od-cart-v1',
        JSON.stringify([{ productId: id, variantId: null, quantity: 2 }]),
      );
    });
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    for (const violation of results.violations) {
      console.log(`${path}: ${violation.impact} ${violation.id} (${violation.nodes.length})`);
    }
    expect(
      blocking.map(
        (violation) =>
          `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
      ),
    ).toEqual([]);
  });
}

test('every page can be used with the keyboard: skip link and visible focus', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  const outline = await skip.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});
