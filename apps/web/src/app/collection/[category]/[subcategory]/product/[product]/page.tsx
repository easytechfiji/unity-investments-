import { categoryPath, productPath, subcategoryPath, type ProductDetail } from '@od/shared';
import { sanitizeRichText } from '@od/shared/sanitize';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { AutoplayVideo } from '../../../../../../components/AutoplayVideo';
import { Breadcrumbs } from '../../../../../../components/Breadcrumbs';
import { DeliveryQuote } from '../../../../../../components/DeliveryQuote';
import { BuyBox } from '../../../../../../components/BuyBox';
import { EnquiryForm } from '../../../../../../components/EnquiryForm';
import { Gallery } from '../../../../../../components/Gallery';
import { JsonLd } from '../../../../../../components/JsonLd';
import { Price, StockStatus } from '../../../../../../components/Price';
import { ProductGrid } from '../../../../../../components/ProductCard';
import { api } from '../../../../../../lib/api';
import { SITE_URL } from '../../../../../../lib/config';
import { contactLinks } from '../../../../../../lib/contact';
import { clip, pageMetadata, stripHtml } from '../../../../../../lib/seo';

interface Props {
  params: Promise<{ category: string; subcategory: string; product: string }>;
}

async function load(params: Props['params']): Promise<ProductDetail> {
  const { category, subcategory, product: slug } = await params;
  const product = await api.product(slug);
  if (!product) {
    const target = await api.redirect(`/collection/${category}/${subcategory}/product/${slug}`);
    if (target) permanentRedirect(target);
    notFound();
  }
  // A product lives at exactly one address. Any other path sends people to it.
  if (product.categorySlug !== category || product.subcategorySlug !== subcategory)
    permanentRedirect(product.url);
  return product;
}

function describe(product: ProductDetail): string {
  return (
    product.metaDescription ??
    product.smallDescription ??
    (product.description
      ? stripHtml(product.description)
      : `${product.name}, available from our shop in Nakasi, Fiji.`)
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { product: slug } = await params;
  const product = await api.product(slug);
  if (!product) return { title: 'Page not found' };
  return pageMetadata({
    title: product.metaTitle ?? product.name,
    description: describe(product),
    path: product.url,
    image: product.image?.src,
  });
}

function videoJsonLd(product: ProductDetail) {
  return product.videos.map((item) => ({
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: item.title,
    description: item.description ?? `${item.title}, ${product.name}.`,
    thumbnailUrl: item.poster ? [item.poster.src] : undefined,
    contentUrl: item.url,
    duration: `PT${item.durationSeconds}S`,
    uploadDate: item.uploadedAt,
  }));
}

function productJsonLd(product: ProductDetail) {
  const availability = `https://schema.org/${product.stock > 0 ? 'InStock' : 'OutOfStock'}`;
  const url = `${SITE_URL}${product.url}`;
  let offers: Record<string, unknown> | undefined;
  if (product.price !== null && product.priceMax) {
    offers = {
      '@type': 'AggregateOffer',
      lowPrice: product.price,
      highPrice: product.priceMax,
      priceCurrency: 'FJD',
      offerCount: product.variants.length,
      availability,
      url,
    };
  } else if (product.price !== null) {
    offers = {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: 'FJD',
      availability,
      url,
      itemCondition: 'https://schema.org/NewCondition',
    };
  }
  // No price shown (quote only): offers are left out rather than invented (Appendix C).
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: clip(describe(product), 500),
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.gallery.length ? { image: product.gallery.map((image) => image.src) } : {}),
    category: `${product.categoryName} > ${product.subcategoryName}`,
    url,
    ...(offers ? { offers } : {}),
  };
}

export default async function ProductPage({ params }: Props) {
  const product = await load(params);
  const [site, regions] = await Promise.all([api.site(), api.regions()]);
  const quoteOnly = product.price === null;
  const sizes = [...new Set(product.variants.map((variant) => variant.size).filter(Boolean))];
  const colours = [...new Set(product.variants.map((variant) => variant.colour).filter(Boolean))];

  return (
    <div className="wrap page has-sticky-buy">
      <JsonLd data={productJsonLd(product)} />
      {videoJsonLd(product).map((data, index) => (
        <JsonLd key={index} data={data} />
      ))}
      <Breadcrumbs
        items={[
          { name: product.categoryName, path: categoryPath(product.categorySlug) },
          {
            name: product.subcategoryName,
            path: subcategoryPath(product.categorySlug, product.subcategorySlug),
          },
          {
            name: product.name,
            path: productPath(product.categorySlug, product.subcategorySlug, product.slug),
          },
        ]}
      />

      <div className="product">
        <div>
          <Gallery images={product.gallery} name={product.name} />
          {product.videos.length > 0 ? (
            <div id="video" className="video-block">
              {product.videos.map((item) => (
                <div key={item.id} className="video-item">
                  <AutoplayVideo video={item} />
                  <div className="video-caption">
                    <p className="video-title">{item.title}</p>
                    {item.transcript ? <p className="video-transcript">{item.transcript}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="buy">
          <h1>{product.name}</h1>
          {product.sku ? <p className="sku">SKU {product.sku}</p> : null}
          {product.smallDescription ? <p>{product.smallDescription}</p> : null}
          <Price product={product} />
          {product.type === 'simple' ? <StockStatus product={product} /> : null}
          <BuyBox
            productId={product.id}
            name={product.name}
            type={product.type}
            stock={product.stock}
            price={product.price}
            variants={product.variants}
          />
          <div className="delivery-note">
            {regions.length > 0 ? (
              <p>
                Delivery around Fiji is charged by region and shown at checkout before you pay. Or
                choose Click And Collect and pick up from our shop in Nakasi, at no charge.
              </p>
            ) : (
              <p>
                Click And Collect from our shop in Nakasi, at no charge.{' '}
                <DeliveryQuote contact={contactLinks(site)} />
              </p>
            )}
          </div>
        </div>
      </div>

      <section className="section" aria-labelledby="details-title">
        <h2 id="details-title">Product details</h2>
        <dl className="spec">
          {product.sku ? (
            <>
              <dt>SKU</dt>
              <dd>{product.sku}</dd>
            </>
          ) : null}
          <dt>Category</dt>
          <dd>
            {product.categoryName}, {product.subcategoryName}
          </dd>
          {sizes.length ? (
            <>
              <dt>Sizes</dt>
              <dd>{sizes.join(', ')}</dd>
            </>
          ) : null}
          {colours.length ? (
            <>
              <dt>Colours</dt>
              <dd>{colours.join(', ')}</dd>
            </>
          ) : null}
          <dt>Availability</dt>
          <dd>
            {quoteOnly ? 'Price on request' : product.stock > 0 ? 'In stock' : 'Out of stock'}
          </dd>
        </dl>
        {product.description ? (
          // Admin written HTML, cleaned by an allow list on save, in the API, and again here.
          <div
            className="prose"
            dangerouslySetInnerHTML={{ __html: sanitizeRichText(product.description) }}
          />
        ) : null}
        {product.buyersGuide ? (
          <>
            <h2>Buyer&apos;s guide</h2>
            <div
              className="prose"
              dangerouslySetInnerHTML={{ __html: sanitizeRichText(product.buyersGuide) }}
            />
          </>
        ) : null}
      </section>

      {quoteOnly ? (
        <section className="section" id="quote" aria-labelledby="quote-title">
          <h2 id="quote-title">Request a quote</h2>
          <p>Tell us what you need and we will reply with a price.</p>
          <div className="prose">
            <EnquiryForm
              kind="quote"
              productId={product.id}
              productName={product.name}
              sizeOptions={product.quoteSizeOptions}
              turnstileSiteKey={site.turnstileSiteKey}
            />
          </div>
        </section>
      ) : (
        <details className="section quote-details" id="quote">
          <summary>
            <span className="quote-summary">Need a large quantity? Ask for a quote</span>
          </summary>
          <div className="prose">
            <p>Tell us how many you need and we will reply by email with a price.</p>
            <EnquiryForm
              kind="quote"
              productId={product.id}
              productName={product.name}
              sizeOptions={product.quoteSizeOptions}
              turnstileSiteKey={site.turnstileSiteKey}
            />
          </div>
        </details>
      )}

      {product.related.length > 0 ? (
        <section className="section" aria-labelledby="related-title">
          <h2 id="related-title">Related products</h2>
          <ProductGrid products={product.related.slice(0, 5)} wide />
        </section>
      ) : null}

      <div className="sticky-buy no-print">
        <Price product={product} />
        {quoteOnly ? (
          <a className="btn" href="#quote">
            Request a quote
          </a>
        ) : (
          <button className="btn" type="submit" form="buy-form">
            Add to cart
          </button>
        )}
      </div>
    </div>
  );
}
