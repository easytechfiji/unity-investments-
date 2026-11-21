import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OrderLookup } from '../../components/OrderLookup';
import { pageMetadata } from '../../lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Order placed',
  description: 'Your order confirmation.',
  path: '/order-confirmation',
  noindex: true,
});

export default function OrderConfirmationPage() {
  return (
    <div className="wrap page">
      <h1>Order confirmation</h1>
      <Suspense>
        <OrderLookup confirmation />
      </Suspense>
    </div>
  );
}
