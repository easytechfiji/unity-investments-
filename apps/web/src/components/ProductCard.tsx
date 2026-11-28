import type { ProductCard as Card } from '@od/shared';
import Link from 'next/link';
import { AddToCartInline } from './AddToCartInline';
import { Price, StockStatus } from './Price';
import { ProductImage } from './ProductImage';

const CARD_SIZES = '(min-width: 1024px) 240px, (min-width: 600px) 33vw, 50vw';

export function ProductCard({
  product,
  priority = false,
  headingLevel = 3,
}: {
  product: Card;
  priority?: boolean;
  /** h2 when the grid sits straight under the page h1, h3 inside a section with its own h2. */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  // Arriving soon, or no price yet: the card leads to the quotation form.
  const quote = product.availability === 'arriving_soon' || product.price === null;
  const canBuyHere = product.type === 'simple' && !quote && product.stock > 0;
  return (
    <article className="card">
      <ProductImage
        image={product.image}
        alt={product.name}
        sizes={CARD_SIZES}
        priority={priority}
      />
      <div className="card-body">
        <Heading className="card-name">
          <Link href={product.url}>{product.name}</Link>
        </Heading>
        {product.sku ? <p className="sku">SKU {product.sku}</p> : null}
        <Price product={product} />
        <StockStatus product={product} />
      </div>
      {canBuyHere ? (
        <AddToCartInline productId={product.id} max={product.stock} name={product.name} />
      ) : (
        <div className="card-actions">
          <Link className="btn btn-plain" href={quote ? `${product.url}#quote` : product.url}>
            {quote ? 'Request quotation' : product.stock <= 0 ? 'View details' : 'Choose options'}
          </Link>
        </div>
      )}
    </article>
  );
}

export function ProductGrid({
  products,
  wide = false,
  priorityCount = 0,
  headingLevel = 3,
}: {
  products: Card[];
  wide?: boolean;
  priorityCount?: number;
  headingLevel?: 2 | 3;
}) {
  return (
    <ul className={`grid${wide ? ' grid-wide' : ''}`}>
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard
            product={product}
            priority={index < priorityCount}
            headingLevel={headingLevel}
          />
        </li>
      ))}
    </ul>
  );
}
