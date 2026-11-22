import type { MenuCategory, SiteInfo } from '@od/shared';
import Link from 'next/link';
import { CartLink } from './CartLink';
import { LocationIcon, PhoneIcon, SearchIcon } from './icons';
import { MegaMenu } from './MegaMenu';
import { MobileMenu } from './MobileMenu';

const TOP_LINKS = 6;

export function Header({
  site,
  menu,
  query = '',
}: {
  site: SiteInfo;
  menu: MenuCategory[];
  query?: string;
}) {
  const phoneHref = site.phone ? `tel:${site.phone.replace(/[^+\d]/g, '')}` : null;
  return (
    <header>
      <div className="utility">
        <div className="wrap">
          <div className="utility-contact">
            {site.phone && phoneHref ? (
              <a href={phoneHref}>
                <PhoneIcon className="icon icon-inline" />
                {site.phone}
              </a>
            ) : null}
            {site.email ? (
              <a className="utility-optional" href={`mailto:${site.email}`}>
                {site.email}
              </a>
            ) : null}
            {site.address ? (
              <span className="utility-optional">
                <LocationIcon className="icon icon-inline" />
                {site.address}
              </span>
            ) : null}
          </div>
          <nav className="utility-links" aria-label="Help">
            <Link className="utility-optional" href="/delivery">
              Delivery and pickup
            </Link>
            <Link href="/order-lookup">Check an order</Link>
            <Link className="utility-optional" href="/contact_us">
              Contact us
            </Link>
          </nav>
        </div>
      </div>

      <div className="masthead">
        <div className="wrap">
          <Link className="brand" href="/">
            {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed size logo; srcset covers sharp screens */}
            <img
              src="/brand/logo-64.webp"
              srcSet="/brand/logo-64.webp 1x, /brand/logo-128.webp 2x"
              width={64}
              height={64}
              alt=""
            />
            <span className="brand-name">
              Unity
              <span>Investment</span>
            </span>
          </Link>

          <form className="search" action="/search" method="get" role="search">
            <label className="visually-hidden" htmlFor="search-category">
              Category
            </label>
            <select id="search-category" name="category" defaultValue="">
              <option value="">All categories</option>
              {menu.map((category) => (
                <option key={category.id} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
            <label className="visually-hidden" htmlFor="search-q">
              Search products
            </label>
            <input
              id="search-q"
              type="search"
              name="q"
              placeholder="Search products or SKU"
              defaultValue={query}
              maxLength={100}
            />
            <button className="btn" type="submit">
              <SearchIcon />
              Search
            </button>
          </form>

          <div className="header-actions">
            <CartLink />
            <MobileMenu menu={menu} />
          </div>
        </div>
      </div>

      <nav className="catbar" aria-label="Product categories">
        <div className="wrap">
          <MegaMenu menu={menu} />
          {menu.slice(0, TOP_LINKS).map((category) => (
            <Link key={category.id} href={`/collection/${category.slug}`}>
              {category.name}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
