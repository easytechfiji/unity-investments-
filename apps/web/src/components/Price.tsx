import { formatPrice, toCents, type ProductCard } from '@od/shared';

const money = (value: string) => formatPrice(toCents(value));

/** The price block used on cards and the product page. No price means "request a quote". */
export function Price({
  product,
  className = '',
}: {
  product: Pick<ProductCard, 'price' | 'wasPrice' | 'priceMax'>;
  className?: string;
}) {
  if (product.price === null) {
    return <p className={`price price-quote ${className}`}>Price on request</p>;
  }
  if (product.wasPrice) {
    return (
      <p className={`price ${className}`}>
        <span className="price-sale">
          <span className="visually-hidden">Sale price </span>
          {money(product.price)}
        </span>
        <del className="price-was">
          <span className="visually-hidden">Was </span>
          {money(product.wasPrice)}
        </del>
      </p>
    );
  }
  if (product.priceMax) {
    return (
      <p className={`price ${className}`}>
        <span className="price-from">From </span>
        {money(product.price)}
      </p>
    );
  }
  return <p className={`price ${className}`}>{money(product.price)}</p>;
}

/**
 * Stock in words and colour, never colour alone. Real numbers only: the exact
 * count ("3 left"), or "Arriving soon" for a product that is on its way.
 */
export function StockStatus({
  product,
}: {
  product: Pick<ProductCard, 'stockStatus' | 'stock' | 'price' | 'availability'>;
}) {
  if (product.availability === 'arriving_soon') {
    return <p className="stock stock-arriving">Arriving soon</p>;
  }
  if (product.price === null) return null;
  return (
    <p className={`stock stock-${product.stockStatus}`}>
      {product.stockStatus === 'out_of_stock' ? 'Out of stock' : `${product.stock} left`}
    </p>
  );
}
