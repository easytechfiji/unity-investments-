import Link from 'next/link';

// A real 404, not a redirect to the home page (the old site's soft 404).
export default function NotFound() {
  return (
    <div className="wrap page prose">
      <h1>Page not found</h1>
      <p>We could not find that page. It may have moved, or the product may no longer be sold.</p>
      <form action="/search" method="get" role="search" className="search">
        <label className="visually-hidden" htmlFor="nf-q">
          Search products
        </label>
        <input id="nf-q" type="search" name="q" placeholder="Search products or SKU" />
        <button className="btn" type="submit">
          Search
        </button>
      </form>
      <p className="hours">
        Or go to <Link href="/collection">all categories</Link> or the{' '}
        <Link href="/">home page</Link>.
      </p>
    </div>
  );
}
