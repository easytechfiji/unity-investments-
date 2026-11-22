import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OrderLookup } from '../../components/OrderLookup';
import { pageMetadata } from '../../lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Check an order',
  description: 'See the status of your order with your order reference and email address.',
  path: '/order-lookup',
  noindex: true,
});

export default function OrderLookupPage() {
  return (
    <div className="wrap page">
      <h1>Check an order</h1>
      <Suspense>
        <OrderLookup />
      </Suspense>
    </div>
  );
}
