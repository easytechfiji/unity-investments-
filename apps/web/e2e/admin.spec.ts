import { createHmac, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E } from '../playwright.config';

// The admin app, end to end: first sign in with authenticator set up, then
// running an order and editing the catalogue.

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret: string): string {
  let bits = '';
  for (const char of secret) bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

// Set SCREENSHOTS=1 to save pictures of the admin pages into .data/screenshots.
const shot = async (page: Page, name: string) => {
  if (process.env.SCREENSHOTS === '1') {
    await page.screenshot({ path: `../../.data/screenshots/admin-${name}.png`, fullPage: true });
  }
};

const email = `owner-${randomUUID().slice(0, 8)}@example.test`;
const password = `test-${randomUUID()}`;

test.beforeAll(async () => {
  const response = await fetch(`${E2E.auth}/admin/users`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer local-development-service-key',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const user = (await response.json()) as { id: string };
  const client = new pg.Client({ connectionString: E2E.database });
  await client.connect();
  await client.query('insert into auth.users (id, email) values ($1, $2)', [user.id, email]);
  await client.query(
    `insert into public.admin_profiles (user_id, name, role) values ($1, 'E2E Owner', 'owner')`,
    [user.id],
  );
  await client.end();
});

test('sign in with two-factor, mark a bank transfer paid and add a category', async ({
  page,
  request,
}) => {
  // An order to work on.
  const product = (await (
    await request.get(`${E2E.api}/v1/products/traffic-cone-700mm`)
  ).json()) as { id: number };
  const order = await request.post(`${E2E.api}/v1/orders`, {
    data: {
      checkoutToken: randomUUID(),
      email: 'customer@example.test',
      firstName: 'Ana',
      phone: '+679 765 4321',
      deliveryMethod: 'click_and_collect',
      paymentMethod: 'bank_transfer',
      lines: [{ productId: product.id, variantId: null, quantity: 2 }],
    },
  });
  const { orderNumber } = (await order.json()) as { orderNumber: string };

  await page.goto(E2E.admin);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();
  const secret = (await page.locator('code').textContent())?.trim() ?? '';
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await page.getByLabel('Code').fill(totp(secret));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await shot(page, 'dashboard');

  // Main tab, then its sub-tab. Both are marked as the current page.
  await page.getByRole('link', { name: 'Sales', exact: true }).click();
  await expect(page).toHaveURL(/\/sales\/orders$/);
  await expect(page.getByRole('link', { name: 'Sales', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('link', { name: 'Orders', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('link', { name: orderNumber }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(orderNumber);
  await shot(page, 'order');
  await page.getByRole('button', { name: 'Mark as paid' }).click();
  await page.getByRole('button', { name: 'Yes, the money is in our account' }).click();
  await expect(page.getByText('Marked as paid. The customer has been emailed.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('paid');

  await page.getByRole('link', { name: 'Products', exact: true }).click();
  await page.getByRole('link', { name: 'Categories', exact: true }).click();
  await expect(page).toHaveURL(/\/products\/categories$/);
  await page.getByRole('link', { name: 'Add category' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Printer ink');
  await page.getByLabel(/Web address/).fill('printer-ink');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Edit category' })).toBeVisible();
  const categories = (await (await request.get(`${E2E.api}/v1/categories`)).json()) as {
    slug: string;
  }[];
  expect(categories.map((category) => category.slug)).toContain('printer-ink');

  await shot(page, 'category');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('link', { name: 'Activity log' }).click();
  await expect(page.getByRole('cell', { name: 'mark paid' })).toBeVisible();

  // Old addresses from before the tabs still work.
  await page.goto(`${E2E.admin}/r/faqs`);
  await expect(page).toHaveURL(/\/website\/faqs$/);
  await page.goto(`${E2E.admin}/orders`);
  await expect(page).toHaveURL(/\/sales\/orders$/);

  // Documents (update 02, part 4): make an invoice, issue it (saved, emailed and
  // downloaded in one go), then pay it with a receipt and void the receipt.
  await page.getByRole('link', { name: 'Documents', exact: true }).click();
  await page.getByRole('link', { name: 'New document' }).click();
  await page.getByLabel('Name or company').fill('Seru Traders');
  await page.getByLabel(/^Email/).fill('seru@example.test');
  await page.getByLabel('Line 1 description').fill('Floral Vine Mauve, Double');
  await page.getByLabel('Line 1 quantity').fill('2');
  await page.getByLabel('Line 1 unit price').fill('50.00');
  await expect(page.getByText('FJ$100.00').first()).toBeVisible();
  await shot(page, 'document-new');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Issue invoice' }).click();
  expect((await download).suggestedFilename()).toBe('INV-0001.pdf');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Invoice INV-0001');
  await expect(page.getByText('Issued, emailed and downloaded.')).toBeVisible();

  await page.getByRole('button', { name: 'Make receipt' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('New official receipt');
  await page.getByLabel('Paid by').selectOption('Cash');
  const receiptDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Issue official receipt' }).click();
  expect((await receiptDownload).suggestedFilename()).toBe('RCT-0001.pdf');
  await page.getByRole('button', { name: 'Void' }).click();
  await page.getByLabel('Reason for voiding').fill('Paid by M-PAiSA, not cash');
  await page.getByRole('button', { name: 'Void RCT-0001' }).click();
  await expect(page.getByText('RCT-0001 is now void.')).toBeVisible();

  await page.getByRole('link', { name: 'Parties' }).click();
  await expect(page.getByRole('link', { name: 'Seru Traders' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
});
