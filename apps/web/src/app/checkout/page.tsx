import type { Metadata } from 'next';
import { CheckoutForm } from '../../components/CheckoutForm';
import { api } from '../../lib/api';
import { contactLinks } from '../../lib/contact';
import { pageMetadata } from '../../lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Checkout',
  description: 'Place your order.',
  path: '/checkout',
  noindex: true,
});

export default async function CheckoutPage() {
  const [regions, site] = await Promise.all([api.regions(), api.site()]);
  return (
    <div className="wrap page">
      <h1>Checkout</h1>
      <CheckoutForm
        regions={regions}
        contact={contactLinks(site)}
        paypal={{
          available: site.paypalAvailable,
          clientId: site.paypalClientId,
          currency: site.paypalCurrency,
        }}
      />
    </div>
  );
}
