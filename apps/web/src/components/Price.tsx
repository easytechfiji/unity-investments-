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

const STOCK_TEXT = {
  in_stock: 'In stock',
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
} as const;

/** Stock in words and colour, never colour alone. Real numbers only. */
export function StockStatus({
  product,
}: {
  product: Pick<ProductCard, 'stockStatus' | 'stock' | 'price'>;
}) {
  if (product.price === null) return null;
  const label = STOCK_TEXT[product.stockStatus];
  return (
    <p className={`stock stock-${product.stockStatus}`}>
      {product.stockStatus === 'out_of_stock' ? label : `${label} (${product.stock})`}
    </p>
  );
}
