import type { Metadata } from 'next';
import { CartView } from '../../components/CartView';
import { pageMetadata } from '../../lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Your cart',
  description: 'The items in your cart.',
  path: '/cart',
  noindex: true,
});

export default function CartPage() {
  return (
    <div className="wrap page">
      <h1>Your cart</h1>
      <CartView />
    </div>
  );
}
