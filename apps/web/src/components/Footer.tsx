import type { MenuCategory, SiteInfo } from '@od/shared';
import Link from 'next/link';

export function Footer({ site, menu }: { site: SiteInfo; menu: MenuCategory[] }) {
  const whatsapp = site.whatsapp ? `https://wa.me/${site.whatsapp.replace(/[^\d]/g, '')}` : null;
  return (
    <footer className="footer">
      <div className="wrap">
        <section>
          <h2>{site.siteName}</h2>
          <address>
            {site.address ? (
              <>
                {site.address}
                <br />
              </>
            ) : null}
            {site.phone ? (
              <>
                Phone <a href={`tel:${site.phone.replace(/[^+\d]/g, '')}`}>{site.phone}</a>
                <br />
              </>
            ) : null}
            {site.phone2 ? (
              <>
                Phone <a href={`tel:${site.phone2.replace(/[^+\d]/g, '')}`}>{site.phone2}</a>
                <br />
              </>
            ) : null}
            {site.email ? (
              <>
                Email <a href={`mailto:${site.email}`}>{site.email}</a>
                <br />
              </>
            ) : null}
            {whatsapp ? <a href={whatsapp}>WhatsApp {site.whatsapp}</a> : null}
          </address>
          {site.openingHours ? <p className="hours">Opening hours: {site.openingHours}</p> : null}
        </section>
        <nav aria-label="Categories">
          <h2>Categories</h2>
          <ul>
            {menu.map((category) => (
              <li key={category.id}>
                <Link href={`/collection/${category.slug}`}>{category.name}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Help">
          <h2>Help</h2>
          <ul>
            <li>
              <Link href="/delivery">Delivery and pickup</Link>
            </li>
            <li>
              <Link href="/faqs">FAQs</Link>
            </li>
            <li>
              <Link href="/order-lookup">Check an order</Link>
            </li>
            <li>
              <Link href="/about_us">About us</Link>
            </li>
            <li>
              <Link href="/contact_us">Contact us</Link>
            </li>
            <li>
              <Link href="/privacy">Privacy</Link>
            </li>
            <li>
              <Link href="/sitemap">Sitemap</Link>
            </li>
            {site.facebookUrl ? (
              <li>
                <a href={site.facebookUrl}>Facebook</a>
              </li>
            ) : null}
            {site.instagramUrl ? (
              <li>
                <a href={site.instagramUrl}>Instagram</a>
              </li>
            ) : null}
          </ul>
        </nav>
      </div>
      <div className="footer-base">
        <div className="wrap">
          Prices are in Fijian dollars (FJD). {site.siteName}, Nakasi, Fiji.
        </div>
      </div>
    </footer>
  );
}
