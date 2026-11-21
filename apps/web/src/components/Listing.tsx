import { formatPrice, toCents, type ProductListResult } from '@od/shared';
import Link from 'next/link';
import { DEFAULT_SORT, SORT_OPTIONS, listingHref, type ListingParams } from '../lib/listing';
import { ProductGrid } from './ProductCard';

interface Props {
  path: string;
  params: ListingParams;
  result: ProductListResult;
  /** Subcategory links shown in the filter column. */
  subcategories?: { name: string; href: string; current?: boolean }[];
}

function Pagination({ path, params, result }: Omit<Props, 'subcategories'>) {
  if (result.totalPages <= 1) return null;
  const pages: number[] = [];
  for (let page = 1; page <= result.totalPages; page += 1) {
    if (page === 1 || page === result.totalPages || Math.abs(page - result.page) <= 2)
      pages.push(page);
  }
  return (
    <nav className="pagination" aria-label="Pages">
      <ul>
        {result.page > 1 ? (
          <li>
            <Link href={listingHref(path, params, { page: result.page - 1 })} rel="prev">
              Previous
            </Link>
          </li>
        ) : null}
        {pages.map((page, index) => (
          <li key={page}>
            {index > 0 && page - (pages[index - 1] ?? page) > 1 ? (
              <span aria-hidden="true">...</span>
            ) : null}
            {page === result.page ? (
              <span aria-current="page">{page}</span>
            ) : (
              <Link href={listingHref(path, params, { page })} aria-label={`Page ${page}`}>
                {page}
              </Link>
            )}
          </li>
        ))}
        {result.page < result.totalPages ? (
          <li>
            <Link href={listingHref(path, params, { page: result.page + 1 })} rel="next">
              Next
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

function FilterForm({
  path,
  params,
  result,
  subcategories,
  idPrefix,
}: Props & { idPrefix: string }) {
  return (
    <>
      {subcategories && subcategories.length > 0 ? (
        <fieldset>
          <legend>Range</legend>
          <ul>
            {subcategories.map((sub) => (
              <li key={sub.href}>
                <Link href={sub.href} aria-current={sub.current ? 'page' : undefined}>
                  {sub.name}
                </Link>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}
      <form action={path} method="get">
        {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
        {params.category && path === '/search' ? (
          <input type="hidden" name="category" value={params.category} />
        ) : null}
        {params.sort ? <input type="hidden" name="sort" value={params.sort} /> : null}
        <fieldset>
          <legend>Price (FJD)</legend>
          {result.priceRange ? (
            <p className="hint">
              {formatPrice(toCents(result.priceRange.min))} to{' '}
              {formatPrice(toCents(result.priceRange.max))}
            </p>
          ) : null}
          <div className="price-inputs">
            <div>
              <label htmlFor={`${idPrefix}-price-min`}>From</label>
              <input
                id={`${idPrefix}-price-min`}
                type="number"
                name="min"
                min={0}
                step="0.01"
                inputMode="decimal"
                defaultValue={params.min ?? ''}
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-price-max`}>To</label>
              <input
                id={`${idPrefix}-price-max`}
                type="number"
                name="max"
                min={0}
                step="0.01"
                inputMode="decimal"
                defaultValue={params.max ?? ''}
              />
            </div>
          </div>
        </fieldset>
        <label className="check">
          <input type="checkbox" name="inStock" value="1" defaultChecked={params.inStock} />
          In stock only
        </label>
        <button className="btn btn-navy btn-block" type="submit">
          Apply filters
        </button>
        {params.min || params.max || params.inStock ? (
          <p>
            <Link
              href={listingHref(path, params, { min: null, max: null, inStock: false, page: 1 })}
            >
              Clear filters
            </Link>
          </p>
        ) : null}
      </form>
    </>
  );
}

/** Filter column, sort, product grid and numbered pages. Works without JavaScript: the forms are plain GET forms. */
export function Listing({ path, params, result, subcategories }: Props) {
  const first = (result.page - 1) * result.pageSize + 1;
  const last = Math.min(result.total, result.page * result.pageSize);
  return (
    <div className="listing">
      <details
        className="filters filters-mobile"
        open={Boolean(params.min || params.max || params.inStock)}
      >
        <summary>Filter</summary>
        <FilterForm
          path={path}
          params={params}
          result={result}
          subcategories={subcategories}
          idPrefix="m"
        />
      </details>
      <aside className="filters filters-desktop" aria-label="Filters">
        <h2 className="filters-title">Filter</h2>
        <FilterForm
          path={path}
          params={params}
          result={result}
          subcategories={subcategories}
          idPrefix="d"
        />
      </aside>

      <div>
        <div className="toolbar">
          <p className="count" role="status">
            {result.total === 0
              ? 'No products found'
              : `Showing ${first} to ${last} of ${result.total} products`}
          </p>
          <form className="sort-form" action={path} method="get">
            {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
            {params.category && path === '/search' ? (
              <input type="hidden" name="category" value={params.category} />
            ) : null}
            {params.min ? <input type="hidden" name="min" value={params.min} /> : null}
            {params.max ? <input type="hidden" name="max" value={params.max} /> : null}
            {params.inStock ? <input type="hidden" name="inStock" value="1" /> : null}
            <div className="field">
              <label htmlFor="sort">Sort by</label>
              <select id="sort" name="sort" defaultValue={params.sort ?? DEFAULT_SORT}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-plain" type="submit">
              Sort
            </button>
          </form>
        </div>
        {result.total === 0 ? (
          <p>Try fewer words, another spelling, or clear the filters.</p>
        ) : (
          <ProductGrid products={result.products} priorityCount={2} headingLevel={2} />
        )}
        <Pagination path={path} params={params} result={result} />
      </div>
    </div>
  );
}
