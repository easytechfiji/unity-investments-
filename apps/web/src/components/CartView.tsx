'use client';

import { formatPrice, toCents, type LineProblem, type PricedCart } from '@od/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cart, useCart } from '../lib/cart';
import { postJson } from '../lib/submit';
import { ProductImage } from './ProductImage';

export function problemText(problem: LineProblem, available: number): string {
  switch (problem) {
    case 'not_found':
    case 'unavailable':
      return 'This product is no longer sold. Remove it to continue.';
    case 'choose_variant':
      return 'Choose a size or colour on the product page.';
    case 'variant_not_found':
      return 'This option is no longer available. Remove it to continue.';
    case 'quote_only':
      return 'This item is price on request. Remove it and ask us for a quote.';
    case 'out_of_stock':
      return 'Out of stock. Remove it to continue.';
    case 'not_enough_stock':
      return `Only ${available} left. Lower the quantity to continue.`;
  }
}

const money = (value: string | null) => (value === null ? '' : formatPrice(toCents(value)));

/** Prices the cart through the API whenever it changes. Nothing about price is trusted from the browser. */
export function usePricedCart(extra: { deliveryMethod?: string; regionId?: number } = {}) {
  const lines = useCart();
  const key = JSON.stringify({ lines, ...extra });
  // The latest answer from the API, and which cart it was for. "Loading" is
  // simply "the answer we have is for a different cart".
  const [result, setResult] = useState<{
    key: string;
    priced: PricedCart | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const { lines: current, ...rest } = JSON.parse(key) as {
      lines: typeof lines;
      deliveryMethod?: string;
      regionId?: number;
    };
    if (current.length === 0) return;
    const timer = setTimeout(() => {
      void postJson<PricedCart>('/cart/price', { lines: current, ...rest }).then((response) => {
        if (!active) return;
        setResult((previous) =>
          response.ok && response.data
            ? { key, priced: response.data, error: null }
            : {
                key,
                priced: previous?.priced ?? null,
                error: response.message ?? 'Prices could not be loaded.',
              },
        );
      });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key]);

  const empty = lines.length === 0;
  return {
    lines,
    priced: empty ? null : (result?.priced ?? null),
    error: empty ? null : (result?.error ?? null),
    loading: !empty && result?.key !== key,
  };
}

export function CartView() {
  const { lines, priced, error, loading } = usePricedCart();

  if (lines.length === 0) {
    return (
      <div className="prose">
        <p>Your cart is empty.</p>
        <p>
          <Link className="btn btn-navy" href="/collection">
            Browse all categories
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="cart-layout">
      <div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <table className="cart-table">
          <caption className="visually-hidden">Items in your cart</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Photo</span>
              </th>
              <th scope="col">Product</th>
              <th scope="col" className="num">
                Unit price
              </th>
              <th scope="col">Quantity</th>
              <th scope="col" className="num">
                Total
              </th>
              <th scope="col">
                <span className="visually-hidden">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(priced?.lines ?? []).map((line) => {
              const key = `${line.productId}-${line.variantId ?? 0}`;
              return (
                <tr key={key}>
                  <td className="cart-thumb">
                    <ProductImage image={line.image} alt="" sizes="64px" />
                  </td>
                  <td>
                    {line.url ? <Link href={line.url}>{line.name}</Link> : line.name}
                    {line.variantLabel ? <div className="sku">{line.variantLabel}</div> : null}
                    {line.sku ? <div className="sku">SKU {line.sku}</div> : null}
                    {line.problem ? (
                      <div className="line-problem">
                        {problemText(line.problem, line.available)}
                      </div>
                    ) : null}
                  </td>
                  <td className="num" data-label="Unit price">
                    {money(line.unitPrice)}
                  </td>
                  <td>
                    <label className="visually-hidden" htmlFor={`cart-qty-${key}`}>
                      Quantity of {line.name}
                    </label>
                    <input
                      id={`cart-qty-${key}`}
                      className="qty"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={999}
                      defaultValue={line.quantity}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isInteger(value) && value >= 1)
                          cart.setQuantity(line.productId, line.variantId, value);
                      }}
                    />
                  </td>
                  <td className="num" data-label="Total">
                    {money(line.lineTotal)}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => cart.remove(line.productId, line.variantId)}
                    >
                      Remove<span className="visually-hidden"> {line.name}</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && !priced ? <p role="status">Working out prices.</p> : null}
      </div>
      <aside className="totals" aria-label="Cart totals">
        <dl>
          <dt>Subtotal</dt>
          <dd>{priced ? money(priced.subtotal) : ''}</dd>
          <dt>Delivery</dt>
          <dd>Chosen at checkout</dd>
          <dt className="grand">Total before delivery</dt>
          <dd className="grand">{priced ? money(priced.total) : ''}</dd>
        </dl>
        {priced && !priced.ok ? (
          <p className="line-problem">Sort out the items marked above to continue.</p>
        ) : null}
        {priced?.ok ? (
          <Link className="btn btn-block" href="/checkout">
            Go to checkout
          </Link>
        ) : (
          <button className="btn btn-block" type="button" disabled>
            Go to checkout
          </button>
        )}
        <p className="hint hours">
          Prices are in Fijian dollars. Click And Collect from our shop is free; delivery options
          are shown at checkout.
        </p>
      </aside>
    </div>
  );
}
