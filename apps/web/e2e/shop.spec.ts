import { expect, test } from '@playwright/test';

test('find, add to cart, check out by bank transfer and look the order up', async ({ page }) => {
  // Search from the header.
  await page.goto('/');
  await page.getByLabel('Search products').fill('eraser');
  await page.getByRole('button', { name: 'Search' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('eraser');
  await page.getByRole('link', { name: 'Whiteboard eraser' }).click();

  // Simple product: quantity and add.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Whiteboard eraser');
  await page.getByLabel('Quantity', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.getByText('Added to your cart.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Cart \(3\)/ })).toBeVisible();

  // Variable product: an option must be chosen first.
  await page.goto(
    '/collection/office-furniture/office-chairs-range/product/ergonomic-mesh-office-chair',
  );
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.getByText('Choose a colour first.')).toBeVisible();
  await page.getByLabel('Colour').selectOption('Black');
  await expect(page.getByText('FJ$389.00').first()).toBeVisible();
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.getByText('Added to your cart.')).toBeVisible();

  // Cart: priced by the server.
  await page.goto('/cart');
  await expect(page.getByRole('cell', { name: 'FJ$16.50' })).toBeVisible();
  await expect(page.getByText('FJ$405.50').first()).toBeVisible();
  await page.getByRole('link', { name: 'Go to checkout' }).click();

  // Checkout: delivery to a Fiji region shows its charge.
  await page.getByLabel('First name').fill('Mere');
  await page.getByLabel('Last name').fill('Tester');
  await page.getByLabel('Email').fill('mere.tester@example.test');
  await page.getByLabel(/^Phone/).fill('+679 123 4567');
  await page.getByText('Delivery in Fiji').click();
  await page.getByLabel('Delivery region').selectOption({ label: 'Nausori, FJ$15.00' });
  await expect(page.locator('.grand').last()).toHaveText('FJ$420.50');
  // Back to collection to keep the test address free.
  await page.getByText('Click And Collect, free').click();
  await expect(page.locator('.grand').last()).toHaveText('FJ$405.50');
  await page.getByRole('button', { name: 'Place order' }).click();

  // Confirmation: order number, bank details from the server, payment reference.
  await expect(page.getByRole('heading', { name: 'Order confirmation' })).toBeVisible();
  await expect(page.getByText(/Your order OD-\d+ has been placed/)).toBeVisible();
  await expect(page.getByText('SAMPLE ACCOUNT NAME')).toBeVisible();
  const orderNumber = (await page.locator('.bank-details dd').last().textContent()) ?? '';
  expect(orderNumber).toMatch(/^OD-\d{6}$/);
  const reference =
    (await page.getByText(/Keep your order reference/).textContent())?.split(': ')[1] ?? '';
  expect(reference).toMatch(/^[0-9a-f]{32}$/);
  await expect(page.getByRole('link', { name: /Cart \(0\)/ })).toBeVisible();

  // Order lookup in a fresh tab needs the email as well as the reference.
  const lookup = await page.context().newPage();
  await lookup.goto('/order-lookup');
  await lookup.getByLabel('Order reference').fill(reference);
  await lookup.getByLabel('Email').fill('someone.else@example.test');
  await lookup.getByRole('button', { name: 'Find my order' }).click();
  await expect(lookup.locator('.form-error')).toContainText('No order matches');
  await lookup.getByLabel('Email').fill('mere.tester@example.test');
  await lookup.getByRole('button', { name: 'Find my order' }).click();
  await expect(lookup.getByText(orderNumber).first()).toBeVisible();
});

test('the cart refuses more than the stock and explains why', async ({ page }) => {
  // The product page already caps the quantity at the stock, so put 9 in the
  // cart directly, as an edited browser could.
  await page.goto('/');
  await page.evaluate(async () => {
    const response = await fetch('http://localhost:4100/v1/products/glue-sticks-21g-pack-of-12');
    const { id } = (await response.json()) as { id: number };
    window.localStorage.setItem(
      'od-cart-v1',
      JSON.stringify([{ productId: id, variantId: null, quantity: 9 }]),
    );
  });
  await page.goto('/cart');
  await expect(page.getByText(/Only \d+ left\. Lower the quantity to continue\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to checkout' })).toBeDisabled();
});

test('a price tampered with in the browser has no effect', async ({ page }) => {
  await page.goto('/');
  const id = await page.evaluate(async () => {
    const response = await fetch('http://localhost:4100/v1/products/whiteboard-eraser');
    return ((await response.json()) as { id: number }).id;
  });
  await page.evaluate((productId) => {
    window.localStorage.setItem(
      'od-cart-v1',
      JSON.stringify([{ productId, variantId: null, quantity: 1, price: 0.01 }]),
    );
  }, id);
  await page.goto('/cart');
  await expect(page.getByRole('cell', { name: 'FJ$5.50' }).first()).toBeVisible();
});

test('filters, sorting and pages use real links', async ({ page }) => {
  await page.goto('/collection/office-stationery');
  await page.getByLabel('Sort by').selectOption('price_desc');
  await page.getByRole('button', { name: 'Sort' }).click();
  await expect(page).toHaveURL(/sort=price_desc/);
  const prices = await page.locator('.grid .price').allTextContents();
  const values = prices.map((text) =>
    Number(/FJ\$([\d,.]+)/.exec(text)?.[1]?.replace(/,/g, '') ?? '0'),
  );
  expect(values).toEqual([...values].sort((a, b) => b - a));
  const robots = await page.locator('meta[name="robots"]').getAttribute('content');
  expect(robots).toContain('noindex');
});

test('the contact form sends a message', async ({ page }) => {
  await page.goto('/contact_us');
  await page.getByLabel('Your name').fill('Ana');
  await page.getByLabel('Email').fill('ana@example.test');
  await page.getByLabel('Message').fill('Do you deliver to Taveuni?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Your message has been sent')).toBeVisible();
});

test('a product arriving soon has no count and no cart, only a quotation request', async ({
  page,
}) => {
  await page.goto('/collection/road-safety/safety-signs/product/wet-floor-sign');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wet floor sign');
  await expect(page.getByText('Arriving soon').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to cart' })).toHaveCount(0);
  await expect(page.getByText(/\d+ left/)).toHaveCount(0);
  await page.getByRole('link', { name: 'Request quotation' }).first().click();
  await expect(page.getByRole('heading', { name: 'Request quotation' })).toBeVisible();

  // A product in stock shows its exact count.
  await page.goto('/collection/road-safety/cones-and-barriers/product/retractable-barrier-post');
  await expect(page.getByText('6 left').first()).toBeVisible();
});
