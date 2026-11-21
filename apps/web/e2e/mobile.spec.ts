import { expect, test } from '@playwright/test';

test('the menu opens as a full list of categories and closes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.catbar')).toBeHidden();
  await page.getByRole('button', { name: 'Menu' }).click();
  const dialog = page.getByRole('dialog', { name: 'Menu' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Road safety' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Safety tape' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Safety tape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the add to cart bar stays at the bottom of a product page', async ({ page }) => {
  await page.goto('/collection/road-safety/cones-and-barriers/product/traffic-cone-700mm');
  const bar = page.locator('.sticky-buy');
  await expect(bar).toBeVisible();
  await page.mouse.wheel(0, 2000);
  await expect(bar).toBeInViewport();
  await bar.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByText('Added to your cart.')).toBeVisible();
});

test('nothing is wider than a 360 pixel screen', async ({ page }) => {
  for (const path of ['/', '/collection/office-furniture', '/cart', '/checkout', '/contact_us']) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
