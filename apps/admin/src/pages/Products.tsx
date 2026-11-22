import { formatPrice, toCents } from '@od/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api, ApiError, formatDate } from '../api';
import {
  ConfirmButton,
  Field,
  Thumb,
  asText,
  toPayload,
  type FieldDef,
  type Values,
} from '../components';

interface ProductRow {
  id: number;
  name: string;
  sku: string | null;
  type: string;
  original_price: string;
  sale_price: string | null;
  stock: number;
  status: boolean;
  image_url: string | null;
  category_name: string;
  subcategory_name: string;
  updated_at: string;
}

interface Option {
  value: number;
  label: string;
}

export function Products() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<{
    products: ProductRow[];
    total: number;
    pageSize: number;
  } | null>(null);
  const [categories, setCategories] = useState<Option[]>([]);
  const [search, setSearch] = useState(params.get('q') ?? '');

  useEffect(() => {
    void api
      .get<{ id: number; name: string }[]>('/categories')
      .then((rows) => setCategories(rows.map((row) => ({ value: row.id, label: row.name }))));
  }, []);
  useEffect(() => {
    void api.get<typeof data>(`/products?${params.toString()}`).then(setData);
  }, [params]);

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };
  const page = Number(params.get('page') ?? '1');

  return (
    <>
      <h1>Products</h1>
      <p className="row">
        <Link className="btn" to="/products/new">
          Add product
        </Link>
        <Link className="btn btn-plain" to="/products/import">
          Import or export Excel
        </Link>
      </p>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          set('q', search.trim() || null);
        }}
      >
        <label className="visually-hidden" htmlFor="product-search">
          Search products
        </label>
        <input
          id="product-search"
          type="search"
          placeholder="Name, SKU or slug"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button className="btn" type="submit">
          Search
        </button>
        <label className="visually-hidden" htmlFor="product-category">
          Category
        </label>
        <select
          id="product-category"
          value={params.get('category_id') ?? ''}
          onChange={(event) => set('category_id', event.target.value || null)}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
        <label className="visually-hidden" htmlFor="product-stock">
          Stock
        </label>
        <select
          id="product-stock"
          value={params.get('stock') ?? ''}
          onChange={(event) => set('stock', event.target.value || null)}
        >
          <option value="">Any stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        <button
          className="btn btn-plain"
          type="button"
          onClick={() => set('trash', params.get('trash') ? null : '1')}
        >
          {params.get('trash') ? 'Back to products' : 'Show trash'}
        </button>
      </form>
      {!data ? (
        <p>Loading.</p>
      ) : (
        <>
          <p className="muted">{data.total} products</p>
          <table className="list">
            <thead>
              <tr>
                <th scope="col">Image</th>
                <th scope="col">Product</th>
                <th scope="col">Category</th>
                <th scope="col" className="num">
                  Price (FJD)
                </th>
                <th scope="col" className="num">
                  Stock
                </th>
                <th scope="col">Shown</th>
                <th scope="col">Updated</th>
                {params.get('trash') ? <th scope="col">Restore</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <Thumb src={product.image_url} />
                  </td>
                  <td>
                    <Link to={`/products/${product.id}`}>{product.name}</Link>
                    <div className="muted">
                      {product.sku ?? 'No SKU'}
                      {product.type === 'variable' ? ', has variants' : ''}
                    </div>
                  </td>
                  <td>
                    {product.category_name}
                    <div className="muted">{product.subcategory_name}</div>
                  </td>
                  <td className="num">
                    {product.type === 'variable'
                      ? 'Variants'
                      : product.sale_price
                        ? `${formatPrice(toCents(product.sale_price))} sale`
                        : formatPrice(toCents(product.original_price))}
                  </td>
                  <td className={`num ${product.stock <= 0 ? 'warn' : ''}`}>{product.stock}</td>
                  <td>{product.status ? 'Yes' : 'No'}</td>
                  <td>{formatDate(product.updated_at)}</td>
                  {params.get('trash') ? (
                    <td>
                      <button
                        className="btn btn-plain"
                        type="button"
                        onClick={() =>
                          void api
                            .post(`/products/${product.id}/restore`)
                            .then(() => setParams(new URLSearchParams(params)))
                        }
                      >
                        Restore
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="row pager">
            {page > 1 ? (
              <button
                className="btn btn-plain"
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set('page', String(page - 1));
                  setParams(next);
                }}
              >
                Previous
              </button>
            ) : null}
            {page * data.pageSize < data.total ? (
              <button
                className="btn btn-plain"
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set('page', String(page + 1));
                  setParams(next);
                }}
              >
                Next
              </button>
            ) : null}
          </p>
        </>
      )}
    </>
  );
}

const PRODUCT_FIELDS: FieldDef[] = [
  { name: 'name', label: 'Name', type: 'text', required: true },
  {
    name: 'slug',
    label: 'Web address (slug)',
    type: 'text',
    hint: 'Lowercase words joined by hyphens. Keep it the same after launch so links keep working.',
    required: true,
  },
  { name: 'sku', label: 'SKU', type: 'text' },
  { name: 'category_id', label: 'Category', type: 'select', required: true },
  { name: 'subcategory_id', label: 'Subcategory', type: 'select', required: true },
  {
    name: 'type',
    label: 'Type',
    type: 'select',
    options: [
      { value: 'simple', label: 'Simple: one price and stock' },
      { value: 'variable', label: 'Has variants: sizes or colours with their own price and stock' },
    ],
  },
  {
    name: 'original_price',
    label: 'Price (FJD)',
    type: 'money',
    hint: 'Enter 0 to show "Price on request".',
  },
  {
    name: 'sale_price',
    label: 'Sale price (FJD)',
    type: 'money',
    hint: 'Shown only while the sale is switched on in Settings.',
  },
  {
    name: 'stock',
    label: 'Stock',
    type: 'number',
    hint: 'For simple products. Variants have their own stock.',
  },
  {
    name: 'small_description',
    label: 'Short description',
    type: 'textarea',
    hint: 'One or two sentences under the name.',
  },
  {
    name: 'description',
    label: 'Description (HTML)',
    type: 'html',
    hint: 'Write your own words rather than copying the supplier. Paragraphs, lists, headings, links and tables only.',
  },
  { name: 'buyers_guide', label: "Buyer's guide (HTML)", type: 'html' },
  { name: 'status', label: 'Show on the website', type: 'checkbox' },
  { name: 'featured', label: 'Featured', type: 'checkbox' },
  { name: 'trending', label: 'Trending', type: 'checkbox' },
  {
    name: 'spotlight',
    label: 'Spotlight on the home page',
    type: 'checkbox',
    hint: 'Shows in its own section just under the hero, and always first in the Recommended order.',
  },
  {
    name: 'sort_rank',
    label: 'Recommended order rank',
    type: 'number',
    hint: 'Lower shows first in the default Recommended order. Leave at 1000 for no particular rank.',
  },
  {
    name: 'meta_title',
    label: 'Search engine title',
    type: 'text',
    hint: 'About 60 characters. Leave empty to use the name.',
  },
  {
    name: 'meta_description',
    label: 'Search engine description',
    type: 'textarea',
    hint: 'About 155 characters.',
  },
  {
    name: 'meta_keywords',
    label: 'Keywords',
    type: 'text',
    hint: 'Kept from imports. Search engines ignore it.',
  },
  {
    name: 'tax',
    label: 'Tax rate (%)',
    type: 'number',
    hint: 'Stored for later. Tax is not charged until it is switched on.',
  },
];

interface Variant {
  id?: number;
  sku: string | null;
  color_id: number | null;
  size_id: number | null;
  price: string;
  stock: number;
}

interface ProductData extends Values {
  id: number;
  image_url: string | null;
  variants: Variant[];
  images: { id: number; image_url: string | null }[];
  deleted_at: string | null;
}

export function ProductEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const [values, setValues] = useState<Values>({
    type: 'simple',
    status: true,
    stock: 0,
    original_price: '0',
    featured: false,
    trending: false,
    spotlight: false,
    sort_rank: 1000,
  });
  const [product, setProduct] = useState<ProductData | null>(null);
  const [categories, setCategories] = useState<Option[]>([]);
  const [subcategories, setSubcategories] = useState<
    { id: number; name: string; category_id: number }[]
  >([]);
  const [attributeValues, setAttributeValues] = useState<
    { id: number; name: string; attribute_id: number }[]
  >([]);
  const [attributeOptions, setAttributeOptions] = useState<{ id: number; code: string }[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void api
      .get<{ id: number; name: string }[]>('/categories')
      .then((rows) => setCategories(rows.map((row) => ({ value: row.id, label: row.name }))));
    void api.get<typeof subcategories>('/subcategories').then(setSubcategories);
    void api.get<typeof attributeValues>('/attribute-values').then(setAttributeValues);
    void api.get<typeof attributeOptions>('/attribute-options').then(setAttributeOptions);
  }, []);

  const loadProduct = useMemo(
    () => () => {
      if (isNew) return;
      void api.get<ProductData>(`/products/${id}`).then((data) => {
        setProduct(data);
        setValues(data);
        setVariants(data.variants);
      });
    },
    [id, isNew],
  );
  useEffect(loadProduct, [loadProduct]);

  const fields = PRODUCT_FIELDS.map((field) => {
    if (field.name === 'category_id') return { ...field, options: categories };
    if (field.name === 'subcategory_id') {
      return {
        ...field,
        options: subcategories
          .filter((sub) => sub.category_id === Number(values.category_id))
          .map((sub) => ({ value: sub.id, label: sub.name })),
      };
    }
    return field;
  });
  const colourGroup = attributeOptions.find((option) => option.code === 'colour')?.id;
  const sizeGroup = attributeOptions.find((option) => option.code === 'size')?.id;
  const colours = attributeValues.filter((value) => value.attribute_id === colourGroup);
  const sizes = attributeValues.filter((value) => value.attribute_id === sizeGroup);

  async function run(work: () => Promise<void>, done: string) {
    setErrors({});
    setMessage(null);
    try {
      await work();
      setMessage({ ok: true, text: done });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.fields);
        setMessage({ ok: false, text: caught.message });
      } else throw caught;
    }
  }

  const save = () =>
    run(async () => {
      const payload = toPayload(PRODUCT_FIELDS, values);
      if (!payload.sale_price) payload.sale_price = null;
      if (isNew) {
        const created = await api.post<{ id: number }>('/products', payload);
        void navigate(`/products/${created.id}`, { replace: true });
      } else {
        await api.put(`/products/${id}`, payload);
        loadProduct();
      }
    }, 'Saved. The website shows the change within a minute.');

  const saveVariants = () =>
    run(async () => {
      await api.put(`/products/${id}/variants`, {
        variants: variants.map((variant) => ({
          ...variant,
          sku: variant.sku ?? '',
          stock: Number(variant.stock),
          price: String(variant.price),
        })),
      });
      loadProduct();
    }, 'Variants saved.');

  const uploadImages = (files: FileList) =>
    run(async () => {
      const form = new FormData();
      for (const file of Array.from(files)) form.append('files', file);
      await api.upload(`/products/${id}/images`, form);
      loadProduct();
    }, 'Photos uploaded.');

  return (
    <>
      <p>
        <Link to="/products">Back to products</Link>
      </p>
      <h1>{isNew ? 'Add product' : `Edit ${asText(values.name)}`}</h1>
      {message ? (
        <p className={message.ok ? 'notice' : 'alert'} role="status">
          {message.text}
        </p>
      ) : null}
      {product?.deleted_at ? <p className="alert">This product is in the trash.</p> : null}
      <form
        className="form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="grid2">
          {fields.slice(0, 9).map((field) => (
            <Field
              key={field.name}
              def={field}
              value={values[field.name]}
              error={errors[field.name]}
              onChange={(value) =>
                setValues((current) => ({
                  ...current,
                  [field.name]: value,
                  ...(field.name === 'category_id' ? { subcategory_id: null } : {}),
                }))
              }
            />
          ))}
        </div>
        {fields.slice(9).map((field) => (
          <Field
            key={field.name}
            def={field}
            value={values[field.name]}
            error={errors[field.name]}
            onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
          />
        ))}
        <p className="row">
          <button className="btn" type="submit">
            Save product
          </button>
          {!isNew && !product?.deleted_at ? (
            <ConfirmButton
              label="Move to trash"
              confirmLabel="Yes, move to trash"
              onConfirm={async () => {
                await api.remove(`/products/${id}`);
                void navigate('/products');
              }}
            />
          ) : null}
        </p>
      </form>

      {!isNew && values.type === 'variable' ? (
        <section>
          <h2>Variants</h2>
          <p className="muted">
            Each size and colour combination has its own price and stock. Add sizes and colours
            under Sizes and colours.
          </p>
          <table className="list">
            <thead>
              <tr>
                <th scope="col">Colour</th>
                <th scope="col">Size</th>
                <th scope="col">SKU</th>
                <th scope="col">Price (FJD)</th>
                <th scope="col">Stock</th>
                <th scope="col">
                  <span className="visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant, index) => {
                const update = (change: Partial<Variant>) =>
                  setVariants((current) =>
                    current.map((item, i) => (i === index ? { ...item, ...change } : item)),
                  );
                return (
                  <tr key={variant.id ?? `new-${index}`}>
                    <td>
                      <select
                        aria-label={`Colour of variant ${index + 1}`}
                        value={variant.color_id ?? ''}
                        onChange={(event) =>
                          update({
                            color_id: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                      >
                        <option value="">None</option>
                        {colours.map((colour) => (
                          <option key={colour.id} value={colour.id}>
                            {colour.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={`Size of variant ${index + 1}`}
                        value={variant.size_id ?? ''}
                        onChange={(event) =>
                          update({
                            size_id: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                      >
                        <option value="">None</option>
                        {sizes.map((size) => (
                          <option key={size.id} value={size.id}>
                            {size.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`SKU of variant ${index + 1}`}
                        type="text"
                        value={variant.sku ?? ''}
                        onChange={(event) => update({ sku: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Price of variant ${index + 1}`}
                        type="text"
                        inputMode="decimal"
                        value={variant.price}
                        onChange={(event) => update({ price: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Stock of variant ${index + 1}`}
                        type="number"
                        min={0}
                        value={variant.stock}
                        onChange={(event) => update({ stock: Number(event.target.value) })}
                      />
                    </td>
                    <td>
                      <button
                        className="btn btn-plain"
                        type="button"
                        onClick={() =>
                          setVariants((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {Object.keys(errors).some((key) => key.startsWith('variants')) ? (
            <p className="alert">
              Check the variants:{' '}
              {Object.entries(errors)
                .filter(([key]) => key.startsWith('variants'))
                .map(([, text]) => text)
                .join(' ')}
            </p>
          ) : null}
          <p className="row">
            <button
              className="btn btn-plain"
              type="button"
              onClick={() =>
                setVariants((current) => [
                  ...current,
                  { sku: '', color_id: null, size_id: null, price: '0.00', stock: 0 },
                ])
              }
            >
              Add a variant
            </button>
            <button className="btn" type="button" onClick={() => void saveVariants()}>
              Save variants
            </button>
          </p>
        </section>
      ) : null}

      {!isNew ? (
        <section>
          <h2>Photos</h2>
          <p className="muted">
            Real photos on a plain white or light background. The first one is the main photo. Files
            are resized and cleaned automatically.
          </p>
          <ul className="images">
            {product?.image_url ? (
              <li>
                <img src={product.image_url} alt="Main photo" />
                <strong>Main photo</strong>
                <ConfirmButton
                  label="Remove"
                  confirmLabel="Yes, remove"
                  onConfirm={() =>
                    run(async () => {
                      await api.remove(`/products/${id}/main-image`);
                      loadProduct();
                    }, 'Photo removed.')
                  }
                />
              </li>
            ) : null}
            {product?.images.map((image) => (
              <li key={image.id}>
                {image.image_url ? <img src={image.image_url} alt="Extra photo" /> : null}
                <button
                  className="btn btn-plain"
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      await api.post(`/products/${id}/images/${image.id}/main`);
                      loadProduct();
                    }, 'Main photo changed.')
                  }
                >
                  Make main
                </button>{' '}
                <ConfirmButton
                  label="Remove"
                  confirmLabel="Yes, remove"
                  onConfirm={() =>
                    run(async () => {
                      await api.remove(`/products/${id}/images/${image.id}`);
                      loadProduct();
                    }, 'Photo removed.')
                  }
                />
              </li>
            ))}
          </ul>
          <label htmlFor="product-photos">
            Add photos
            <span className="hint">JPG, PNG or WebP, up to 8 MB each, up to 10 at a time.</span>
          </label>
          <input
            id="product-photos"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) =>
              event.target.files?.length && void uploadImages(event.target.files)
            }
          />
        </section>
      ) : (
        <p className="muted">
          Save the product first, then add photos{values.type === 'variable' ? ' and variants' : ''}
          .
        </p>
      )}
    </>
  );
}

interface ImportResult {
  saved: boolean;
  dryRun: boolean;
  created: number;
  updated: number;
  errors: { row: number; field: string; message: string }[];
}

export function ProductImport() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const form = new FormData();
    form.append('file', file);
    try {
      setResult(
        await api.upload<ImportResult>(`/products/import${dryRun ? '?dryRun=1' : ''}`, form),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The import failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Import and export products</h1>
      <h2>Export</h2>
      <p>
        Download every product as an Excel file. Edit it and import it again to update many products
        at once.
      </p>
      <button
        className="btn btn-plain"
        type="button"
        onClick={() =>
          void api.download(
            '/products/export.xlsx',
            `products-${new Date().toISOString().slice(0, 10)}.xlsx`,
          )
        }
      >
        Download products (.xlsx)
      </button>
      <h2>Import</h2>
      <p>
        The first row holds column names: name, slug, sku, category_slug, subcategory_slug,
        small_description, description, original_price, selling_price, qty, tax, status, trending,
        featured, meta_title, meta_keywords, meta_description. Products are matched by slug: an
        existing slug is updated, a new slug is added (new products need category_slug and
        subcategory_slug). If any row has a problem, nothing is saved.
      </p>
      {error ? <p className="alert">{error}</p> : null}
      <div className="field">
        <label htmlFor="import-file">Excel file (.xlsx)</label>
        <input
          id="import-file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </div>
      <p className="row">
        <button
          className="btn btn-plain"
          type="button"
          disabled={!file || busy}
          onClick={() => void send(true)}
        >
          Check the file first
        </button>
        <button
          className="btn"
          type="button"
          disabled={!file || busy}
          onClick={() => void send(false)}
        >
          Import
        </button>
      </p>
      {result ? (
        result.errors.length ? (
          <>
            <p className="alert">Nothing was saved. Fix these rows and try again.</p>
            <table className="list">
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Column</th>
                  <th scope="col">Problem</th>
                </tr>
              </thead>
              <tbody>
                {result.errors.map((item, index) => (
                  <tr key={index}>
                    <td>{item.row}</td>
                    <td>{item.field}</td>
                    <td>{item.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="notice">
            {result.dryRun ? 'The file is fine. Importing it would add' : 'Imported. Added'}{' '}
            {result.created} and update{result.dryRun ? '' : 'd'} {result.updated} products.
          </p>
        )
      ) : null}
    </>
  );
}
