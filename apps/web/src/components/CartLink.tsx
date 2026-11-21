'use client';

import Link from 'next/link';
import { useCartCount } from '../lib/cart';
import { CartIcon } from './icons';

export function CartLink() {
  const count = useCartCount();
  return (
    <Link className="header-link cart-link" href="/cart" aria-label={`Cart (${count})`}>
      <CartIcon />
      <span className="cart-word">Cart</span>
      <span className="cart-count" aria-hidden="true">
        {count}
      </span>
    </Link>
  );
}
