'use client';

import { formatPrice, toCents, type ProductVariant } from '@od/shared';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { cart } from '../lib/cart';

interface Props {
  productId: number;
  name: string;
  type: 'simple' | 'variable';
  stock: number;
  price: string | null;
  variants: ProductVariant[];
}

const unique = (values: (string | null)[]) => [
  ...new Set(values.filter((value): value is string => value !== null)),
];

/**
 * Size and colour choice, quantity and "Add to cart". The price and stock shown
 * here are for display only; the server prices the cart again at checkout.
 */
export function BuyBox({ productId, name, type, stock, price, variants }: Props) {
  const colours = useMemo(() => unique(variants.map((variant) => variant.colour)), [variants]);
  const sizes = useMemo(() => unique(variants.map((variant) => variant.size)), [variants]);
  const [colour, setColour] = useState(colours.length === 1 ? (colours[0] ?? '') : '');
  const [size, setSize] = useState(sizes.length === 1 ? (sizes[0] ?? '') : '');
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const variant =
    type === 'variable'
      ? (variants.find(
          (item) =>
            (item.colour ?? '') === (colours.length ? colour : '') &&
            (item.size ?? '') === (sizes.length ? size : ''),
        ) ?? null)
      : null;
  const chosenAll = (colours.length === 0 || colour !== '') && (sizes.length === 0 || size !== '');
  const available = type === 'variable' ? (variant?.stock ?? 0) : stock;
  const limit = Math.max(1, Math.min(available, 999));

  if (price === null) {
    return (
      <p>
        <a className="btn btn-block" href="#quote">
          Request a quote
        </a>
      </p>
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (type === 'variable' && !chosenAll) {
      setMessage({
        ok: false,
        text: `Choose ${[colours.length && !colour ? 'a colour' : '', sizes.length && !size ? 'a size' : ''].filter(Boolean).join(' and ')} first.`,
      });
      return;
    }
    if (type === 'variable' && !variant) {
      setMessage({ ok: false, text: 'That combination is not available. Choose another.' });
      return;
    }
    if (available <= 0) {
      setMessage({ ok: false, text: 'This option is out of stock.' });
      return;
    }
    cart.add(productId, variant?.id ?? null, Math.min(quantity, available));
    setMessage({ ok: true, text: 'Added to your cart.' });
  }

  return (
    <form id="buy-form" method="post" onSubmit={submit} noValidate>
      {colours.length > 0 ? (
        <div className="field">
          <label htmlFor="opt-colour">Colour</label>
          <select
            id="opt-colour"
            value={colour}
            onChange={(event) => {
              setColour(event.target.value);
              setMessage(null);
            }}
          >
            {colours.length > 1 ? <option value="">Choose a colour</option> : null}
            {colours.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {sizes.length > 0 ? (
        <div className="field">
          <label htmlFor="opt-size">Size</label>
          <select
            id="opt-size"
            value={size}
            onChange={(event) => {
              setSize(event.target.value);
              setMessage(null);
            }}
          >
            {sizes.length > 1 ? <option value="">Choose a size</option> : null}
            {sizes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {type === 'variable' && variant ? (
        <p className="price" aria-live="polite">
          {formatPrice(toCents(variant.price))}{' '}
          <span
            className={`stock stock-${variant.stock <= 0 ? 'out_of_stock' : variant.stock <= 5 ? 'low_stock' : 'in_stock'}`}
          >
            {variant.stock <= 0 ? 'Out of stock' : `In stock (${variant.stock})`}
          </span>
        </p>
      ) : null}
      <div className="buy-row">
        <div className="field qty-field">
          <label htmlFor="opt-qty">Quantity</label>
          <input
            id="opt-qty"
            className="qty"
            type="number"
            inputMode="numeric"
            min={1}
            max={limit}
            value={quantity}
            onChange={(event) =>
              setQuantity(Math.max(1, Math.min(999, Number(event.target.value) || 1)))
            }
          />
        </div>
        <button className="btn" type="submit" disabled={type === 'simple' && available <= 0}>
          {type === 'simple' && available <= 0 ? 'Out of stock' : 'Add to cart'}
        </button>
      </div>
      <p role="status" className={message?.ok ? 'added' : 'field-error'}>
        {message?.text}
        {message?.ok ? (
          <>
            {' '}
            <Link href="/cart">View cart</Link>
          </>
        ) : null}
      </p>
      <span className="visually-hidden">{name}</span>
    </form>
  );
}
