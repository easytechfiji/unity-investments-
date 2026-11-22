import { formatPrice, toCents } from '@od/shared';
import { sanitizeRichText } from '@od/shared/sanitize';
import type { Metadata } from 'next';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { DeliveryQuote } from '../../components/DeliveryQuote';
import { api } from '../../lib/api';
import { contactLinks } from '../../lib/contact';
import { pageMetadata } from '../../lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Delivery and pickup',
  description:
    'Collect your order free from our shop in Nakasi, or ask us for a delivery quote by phone or WhatsApp.',
  path: '/delivery',
});

export default async function DeliveryPage() {
  const [regions, page, site] = await Promise.all([
    api.regions(),
    api.page('delivery'),
    api.site(),
  ]);
  return (
    <div className="wrap page prose">
      <Breadcrumbs items={[{ name: 'Delivery and pickup', path: '/delivery' }]} />
      <h1>Delivery and pickup</h1>
      <h2>Click And Collect</h2>
      <p>
        Choose Click And Collect at checkout and pick up your order from our shop
        {site.address ? ` at ${site.address}` : ' in Nakasi'}. There is no charge. We contact you
        when your order is ready.
      </p>
      <h2>Delivery</h2>
      {regions.length ? (
        <>
          <p>
            We deliver to these areas. The charge is per order and is added at checkout before you
            pay.
          </p>
          <table className="summary-table">
            <thead>
              <tr>
                <th scope="col">Area</th>
                <th scope="col" className="num">
                  Delivery charge
                </th>
              </tr>
            </thead>
            <tbody>
              {regions.map((region) => (
                <tr key={region.id}>
                  <td>
                    {region.name}
                    {region.description ? <div className="sku">{region.description}</div> : null}
                  </td>
                  <td className="num">{formatPrice(toCents(region.price))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hours">
            If your area is not listed, contact us before you order and we will tell you what is
            possible.
          </p>
        </>
      ) : (
        <p>
          <DeliveryQuote contact={contactLinks(site)} /> Tell us what you need and where, and we
          will reply with the delivery cost.
        </p>
      )}
      {page?.body ? (
        <div dangerouslySetInnerHTML={{ __html: sanitizeRichText(page.body) }} />
      ) : null}
    </div>
  );
}
