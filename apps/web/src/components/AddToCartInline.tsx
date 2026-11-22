'use client';

import { useState } from 'react';
import { cart } from '../lib/cart';

/** Quantity box and "Add to cart" on a product card. Only for simple products in stock. */
export function AddToCartInline({
  productId,
  max,
  name,
}: {
  productId: number;
  max: number;
  name: string;
}) {
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const limit = Math.min(max, 999);

  return (
    <>
      <form
        method="post"
        className="card-actions"
        onSubmit={(event) => {
          event.preventDefault();
          cart.add(productId, null, quantity);
          setAdded(true);
        }}
      >
        <label className="visually-hidden" htmlFor={`qty-${productId}`}>
          Quantity of {name}
        </label>
        <input
          id={`qty-${productId}`}
          className="qty"
          type="number"
          inputMode="numeric"
          min={1}
          max={limit}
          value={quantity}
          onChange={(event) =>
            setQuantity(Math.max(1, Math.min(limit, Number(event.target.value) || 1)))
          }
        />
        <button className="btn" type="submit">
          Add to cart
        </button>
      </form>
      <p className="added" role="status">
        {added ? 'Added to your cart' : ''}
      </p>
    </>
  );
}
