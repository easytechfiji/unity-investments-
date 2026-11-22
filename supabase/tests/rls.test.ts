import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asRole, migratedDb } from './db.js';

let db: PGlite;

// Test data, inserted as the database owner (as the API would with service_role).
const FIXTURES = `
  insert into public.categories (name, slug) values ('Office chairs', 'office-chairs');
  insert into public.categories (name, slug, status) values ('Hidden', 'hidden-category', false);

  insert into public.subcategories (category_id, name, slug)
  select id, 'Ergonomic office chairs', 'ergonomic-office-chairs' from public.categories where slug = 'office-chairs';
  insert into public.subcategories (category_id, name, slug)
  select id, 'Under hidden', 'under-hidden' from public.categories where slug = 'hidden-category';

  insert into public.products (category_id, subcategory_id, name, slug, original_price, sale_price, stock)
  select category_id, id, 'Visible chair', 'visible-chair', 199.00, 149.00, 5
  from public.subcategories where slug = 'ergonomic-office-chairs';

  insert into public.products (category_id, subcategory_id, name, slug, original_price, stock, status)
  select category_id, id, 'Draft chair', 'draft-chair', 10, 1, false
  from public.subcategories where slug = 'ergonomic-office-chairs';

  insert into public.products (category_id, subcategory_id, name, slug, original_price, stock, deleted_at)
  select category_id, id, 'Deleted chair', 'deleted-chair', 10, 1, now()
  from public.subcategories where slug = 'ergonomic-office-chairs';

  insert into public.products (category_id, subcategory_id, name, slug, original_price, stock)
  select category_id, id, 'Chair in hidden category', 'hidden-category-chair', 10, 1
  from public.subcategories where slug = 'under-hidden';

  insert into public.products (category_id, subcategory_id, name, slug, type)
  select category_id, id, 'Variable chair', 'variable-chair', 'variable'
  from public.subcategories where slug = 'ergonomic-office-chairs';

  insert into public.attribute_values (attribute_id, name)
  select id, unnest(array['Large', 'Small']) from public.attribute_options where code = 'size';

  insert into public.product_variants (product_id, size_id, price, stock)
  select p.id, v.id, case v.name when 'Large' then 120.00 else 90.00 end, case v.name when 'Large' then 2 else 3 end
  from public.products p, public.attribute_values v
  where p.slug = 'variable-chair' and v.name in ('Large', 'Small');

  update public.site_settings
  set bank_account_name = 'TEST NAME', bank_branch_code = '000000', bank_account_number = '12345678'
  where id = 1;

  insert into public.orders (email, first_name, phone, delivery_method, subtotal, total, currency, payment_method)
  values ('customer@example.test', 'Test', '0000000', 'click_and_collect', 50.00, 50.00, 'NZD', 'bank_transfer');

  insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'admin@example.test');
  insert into public.admin_profiles (user_id, name, role)
  values ('00000000-0000-0000-0000-000000000001', 'Test admin', 'owner');
  insert into public.admin_audit_log (admin_id, action, entity)
  values ('00000000-0000-0000-0000-000000000001', 'create', 'product');
`;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(FIXTURES);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

async function tableNames(): Promise<string[]> {
  const result = await db.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );
  return result.rows.map((row) => row.tablename);
}

async function publicViewNames(): Promise<string[]> {
  const result = await db.query<{ viewname: string }>(
    `select viewname from pg_views where schemaname = 'public' order by viewname`,
  );
  return result.rows.map((row) => row.viewname);
}

describe('row level security', () => {
  it('is switched on for every table', async () => {
    const result = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and not rowsecurity`,
    );
    expect(result.rows).toEqual([]);
    expect((await tableNames()).length).toBeGreaterThanOrEqual(18);
  });

  it('only exposes views whose names start with public_', async () => {
    for (const view of await publicViewNames()) expect(view).toMatch(/^public_/);
  });
});

describe.each(['anon', 'authenticated'] as const)('the %s role', (role) => {
  it('cannot read any table directly', async () => {
    for (const table of await tableNames()) {
      await expect(
        asRole(db, role, (tx) => tx.query(`select * from public.${table} limit 1`)),
        `select from ${table}`,
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('cannot write to tables', async () => {
    await expect(
      asRole(db, role, (tx) =>
        tx.exec(`insert into public.categories (name, slug) values ('x', 'x')`),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole(db, role, (tx) => tx.exec(`update public.products set original_price = 0.01`)),
    ).rejects.toThrow(/permission denied/);
    await expect(asRole(db, role, (tx) => tx.exec(`delete from public.orders`))).rejects.toThrow(
      /permission denied/,
    );
  });

  // Single table views such as public_faqs are updatable in Postgres and run with
  // the owner's rights, so only the missing grant stops a write through them.
  it('cannot write through the public views', async () => {
    await expect(
      asRole(db, role, (tx) => tx.exec(`update public.public_faqs set answer = 'x'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole(db, role, (tx) =>
        tx.exec(`insert into public.public_banners (image) values ('x.jpg')`),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole(db, role, (tx) => tx.exec(`update public.public_products set original_price = 0.01`)),
    ).rejects.toThrow(/permission denied|cannot update view/);
  });

  it('cannot use the order number sequence', async () => {
    await expect(
      asRole(db, role, (tx) => tx.query(`select nextval('public.order_number_seq')`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('can read every public view', async () => {
    for (const view of await publicViewNames()) {
      await expect(
        asRole(db, role, (tx) => tx.query(`select * from public.${view} limit 1`)),
      ).resolves.toBeDefined();
    }
  });
});

describe('public catalogue views', () => {
  it('show only published products in published categories', async () => {
    const slugs = await asRole(db, 'anon', async (tx) => {
      const result = await tx.query<{ slug: string }>(
        `select slug from public.public_products order by slug`,
      );
      return result.rows.map((row) => row.slug);
    });
    expect(slugs).toEqual(['variable-chair', 'visible-chair']);
  });

  it('hide categories that are switched off, and their subcategories', async () => {
    const result = await asRole(db, 'anon', (tx) =>
      tx.query<{ slug: string }>(
        `select slug from public.public_categories union all select slug from public.public_subcategories`,
      ),
    );
    expect(result.rows.map((row) => row.slug).sort()).toEqual([
      'ergonomic-office-chairs',
      'office-chairs',
    ]);
  });

  it('only show a sale price while the sale is on and not expired', async () => {
    const salePrice = async () => {
      const result = await asRole(db, 'anon', (tx) =>
        tx.query<{ sale_price: string | null }>(
          `select sale_price from public.public_products where slug = 'visible-chair'`,
        ),
      );
      return result.rows[0]?.sale_price;
    };

    expect(await salePrice()).toBeNull();

    await db.exec(
      `update public.sale_settings set active = true, ends_at = now() + interval '1 day'`,
    );
    expect(await salePrice()).toBe('149.00');

    await db.exec(`update public.sale_settings set ends_at = now() - interval '1 minute'`);
    expect(await salePrice()).toBeNull();

    await db.exec(`update public.sale_settings set active = false, ends_at = null`);
  });

  it('give variable products a price range and total stock from their variants', async () => {
    const result = await asRole(db, 'anon', (tx) =>
      tx.query<{ price_min: string; price_max: string; stock: number }>(
        `select price_min, price_max, stock from public.public_products where slug = 'variable-chair'`,
      ),
    );
    expect(result.rows[0]).toEqual({ price_min: '90.00', price_max: '120.00', stock: 5 });
  });

  it('list variants with their size names', async () => {
    const result = await asRole(db, 'anon', (tx) =>
      tx.query<{ size_name: string }>(
        `select size_name from public.public_product_variants order by price`,
      ),
    );
    expect(result.rows.map((row) => row.size_name)).toEqual(['Small', 'Large']);
  });

  it('never include bank details in the public settings', async () => {
    const result = await asRole(db, 'anon', (tx) =>
      tx.query(`select * from public.public_site_settings`),
    );
    const columns = result.fields.map((field) => field.name);
    expect(columns).toContain('site_name');
    expect(columns.filter((name) => name.startsWith('bank'))).toEqual([]);
    expect(JSON.stringify(result.rows)).not.toContain('12345678');
  });
});

describe('data rules', () => {
  it('reject an invalid slug', async () => {
    await expect(
      db.exec(`insert into public.categories (name, slug) values ('Bad', 'Bad Slug')`),
    ).rejects.toThrow(/slug_check|violates check constraint/);
  });

  it('reject a product whose subcategory belongs to another category', async () => {
    await expect(
      db.exec(`
        insert into public.products (category_id, subcategory_id, name, slug)
        select c.id, s.id, 'Mismatch', 'mismatch'
        from public.categories c, public.subcategories s
        where c.slug = 'office-chairs' and s.slug = 'under-hidden'`),
    ).rejects.toThrow(/foreign key/);
  });

  it('reject negative stock and negative prices', async () => {
    await expect(
      db.exec(`update public.products set stock = -1 where slug = 'visible-chair'`),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.exec(`update public.products set original_price = -5 where slug = 'visible-chair'`),
    ).rejects.toThrow(/amount_check|check constraint/);
  });

  it('reject an order whose total does not add up', async () => {
    await expect(
      db.exec(`
        insert into public.orders (email, first_name, phone, delivery_method, subtotal, total, currency, payment_method)
        values ('a@example.test', 'A', '1', 'click_and_collect', 50.00, 10.00, 'NZD', 'paypal')`),
    ).rejects.toThrow(/check constraint/);
  });

  it('reject shipping cost on a click and collect order', async () => {
    await expect(
      db.exec(`
        insert into public.orders (email, first_name, phone, delivery_method, shipping_cost, subtotal, total, currency, payment_method)
        values ('a@example.test', 'A', '1', 'click_and_collect', 5.00, 50.00, 55.00, 'NZD', 'paypal')`),
    ).rejects.toThrow(/check constraint/);
  });

  it('give orders a sequential number and a long random reference', async () => {
    const result = await db.query<{ order_number: string; public_ref: string }>(
      `select order_number, public_ref from public.orders`,
    );
    expect(result.rows[0]?.order_number).toBe('OD-100001');
    expect(result.rows[0]?.public_ref).toMatch(/^[0-9a-f]{32}$/);
  });

  it('seed the required settings rows', async () => {
    const settings = await db.query(`select 1 from public.site_settings where id = 1`);
    const sale = await db.query(`select 1 from public.sale_settings where id = 1`);
    const options = await db.query<{ code: string }>(
      `select code from public.attribute_options order by code`,
    );
    expect(settings.rows).toHaveLength(1);
    expect(sale.rows).toHaveLength(1);
    expect(options.rows.map((row) => row.code)).toEqual(['colour', 'size']);
  });
});

describe('admin audit log', () => {
  it('lets the API insert and read entries', async () => {
    const count = await asRole(db, 'service_role', async (tx) => {
      await tx.exec(
        `insert into public.admin_audit_log (admin_id, action, entity)
         values ('00000000-0000-0000-0000-000000000001', 'update', 'order')`,
      );
      return (await tx.query(`select 1 from public.admin_audit_log`)).rows.length;
    });
    expect(count).toBe(2);
  });

  it('cannot be changed or deleted by the API', async () => {
    await expect(
      asRole(db, 'service_role', (tx) => tx.exec(`update public.admin_audit_log set action = 'x'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole(db, 'service_role', (tx) => tx.exec(`delete from public.admin_audit_log`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('cannot be changed even by the database owner', async () => {
    await expect(db.exec(`update public.admin_audit_log set action = 'x'`)).rejects.toThrow(
      /insert only/,
    );
    await expect(db.exec(`delete from public.admin_audit_log`)).rejects.toThrow(/insert only/);
    await expect(db.exec(`truncate public.admin_audit_log`)).rejects.toThrow(/insert only/);
  });
});
