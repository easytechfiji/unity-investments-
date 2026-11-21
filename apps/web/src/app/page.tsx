import type { Metadata } from 'next';
import Link from 'next/link';
import { AutoplayVideo } from '../components/AutoplayVideo';
import { CategoryCarousel } from '../components/CategoryCarousel';
import { DeliveryQuote } from '../components/DeliveryQuote';
import { JsonLd } from '../components/JsonLd';
import { ProductGrid } from '../components/ProductCard';
import { ProductImage } from '../components/ProductImage';
import { api } from '../lib/api';
import { categoryImage } from '../lib/categoryImages';
import { SITE_NAME, SITE_URL } from '../lib/config';
import { contactLinks } from '../lib/contact';
import { pageMetadata } from '../lib/seo';

export const metadata: Metadata = {
  ...pageMetadata({
    title: 'Bedsheets and bedding sets in Fiji',
    description:
      'Double bed bedsheets and bedding sets from our shop in Nakasi. Order online and collect from the shop, or ask us for a delivery quote.',
    path: '/',
  }),
  title: { absolute: `${SITE_NAME} | Bedsheets and bedding in Fiji` },
};

export default async function HomePage() {
  const [home, site, menu, regions] = await Promise.all([
    api.home(),
    api.site(),
    api.menu(),
    api.regions(),
  ]);
  const banner = home.banners[0];

  const organisation = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: site.siteName,
    url: SITE_URL,
    logo: `${SITE_URL}/brand/logo.png`,
    image: `${SITE_URL}/opengraph-image.png`,
    ...(site.phone ? { telephone: site.phone } : {}),
    ...(site.email ? { email: site.email } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.address ?? 'Lot 23, Nakasi',
      addressLocality: 'Nakasi',
      addressCountry: 'FJ',
    },
    ...(site.openingHours ? { openingHours: site.openingHours } : {}),
    sameAs: [site.facebookUrl, site.instagramUrl].filter(Boolean),
  };
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.siteName,
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <>
      <JsonLd data={organisation} />
      <JsonLd data={website} />

      <section className="hero" aria-labelledby="hero-title">
        {/* eslint-disable-next-line @next/next/no-img-element -- static file already sized for the hero */}
        <img
          className="hero-image"
          src={banner ? banner.image.src : '/images/hero.webp'}
          srcSet={banner ? banner.image.srcSet : undefined}
          sizes="100vw"
          alt=""
          width={1600}
          height={900}
          fetchPriority="high"
        />
        <div className="hero-inner wrap">
          <h1 id="hero-title">Bedsheets and bedding sets</h1>
          <p>
            Double bed bedsheets and bedding sets in many prints and colours, from our shop in
            Nakasi. Order online and collect in store.
          </p>
          <Link className="btn hero-btn" href="/collection">
            Start shopping
          </Link>
        </div>
      </section>

      <div className="wrap">
        {home.spotlight.length > 0 ? (
          <section className="section" aria-labelledby="displays-title">
            <h2 id="displays-title">Featured products</h2>
            <div className="spotlight-grid">
              {home.spotlight.map((product) => (
                <article key={product.id} className="spotlight-panel">
                  {product.video ? (
                    <AutoplayVideo video={product.video} className="spotlight-panel-media" />
                  ) : (
                    <ProductImage
                      image={product.image}
                      alt={product.name}
                      sizes="(min-width: 768px) 640px, 100vw"
                      className="spotlight-panel-media"
                    />
                  )}
                  <div className="spotlight-panel-body">
                    <h3>
                      <Link href={product.url}>{product.name}</Link>
                    </h3>
                    {product.smallDescription ? <p>{product.smallDescription}</p> : null}
                    <p className="spotlight-panel-links">
                      <Link className="btn" href={`${product.url}#quote`}>
                        Request a quote
                      </Link>
                      <Link href={product.url}>View details</Link>
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {menu.length > 0 ? (
          <section className="section" aria-labelledby="categories-title">
            <div className="section-head">
              <h2 id="categories-title">Shop by category</h2>
              <Link href="/collection">All categories</Link>
            </div>
            <CategoryCarousel
              categories={menu.map(({ id, name, slug }) => ({
                id,
                name,
                slug,
                image: categoryImage(slug),
              }))}
            />
          </section>
        ) : null}

        {home.recommended.length > 0 ? (
          <section className="section" aria-labelledby="recommended-title">
            <div className="section-head">
              <h2 id="recommended-title">All products</h2>
              <Link href="/products">View all products</Link>
            </div>
            <ProductGrid products={home.recommended} wide />
          </section>
        ) : null}

        {home.newProducts.length > 0 ? (
          <section className="section" aria-labelledby="new-title">
            <div className="section-head">
              <h2 id="new-title">New products</h2>
              <Link href="/products?sort=newest">See all new products</Link>
            </div>
            <ProductGrid products={home.newProducts} wide />
          </section>
        ) : null}

        {home.rows.map((row) => (
          <section
            key={row.category.id}
            className="section"
            aria-labelledby={`row-${row.category.id}`}
          >
            <div className="section-head">
              <h2 id={`row-${row.category.id}`}>{row.category.name}</h2>
              <Link href={`/collection/${row.category.slug}`}>
                See all {row.category.name.toLowerCase()}
              </Link>
            </div>
            <ProductGrid products={row.products} wide />
          </section>
        ))}

        <section className="section" aria-labelledby="about-title">
          <h2 id="about-title" className="visually-hidden">
            About ordering
          </h2>
          <div className="about-block">
            <div>
              <h3>Who we are</h3>
              <p>
                {site.siteName} is a business in Nakasi. We sell double bed bedsheets and bedding
                sets in many prints and colours to households and businesses.
              </p>
            </div>
            <div>
              <h3>Delivery and pickup</h3>
              {regions.length > 0 ? (
                <p>
                  We deliver to towns around Fiji for a set charge per region, shown at checkout
                  before you pay. You can also choose Click And Collect and pick up your order from
                  the shop at no charge. <Link href="/delivery">Delivery areas and costs</Link>.
                </p>
              ) : (
                <p>
                  Choose Click And Collect and pick up your order from the shop at no charge.{' '}
                  <DeliveryQuote contact={contactLinks(site)} />
                </p>
              )}
            </div>
            <div>
              <h3>Paying for your order</h3>
              <p>
                Pay by bank transfer using your order number as the reference, and we prepare your
                order once the payment arrives.
                {site.paypalAvailable ? ' You can also pay with PayPal.' : ''} For items marked
                price on request, ask us for a quote.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
