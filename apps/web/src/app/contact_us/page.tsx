import type { Metadata } from 'next';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { EnquiryForm } from '../../components/EnquiryForm';
import { api } from '../../lib/api';
import { pageMetadata } from '../../lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Contact us',
  description: 'Phone, email or visit Unity Investment in Nakasi, or send us a message.',
  path: '/contact_us',
});

export default async function ContactPage() {
  const site = await api.site();
  return (
    <div className="wrap page prose">
      <Breadcrumbs items={[{ name: 'Contact us', path: '/contact_us' }]} />
      <h1>Contact us</h1>
      <dl className="spec">
        {site.address ? (
          <>
            <dt>Address</dt>
            <dd>{site.address}</dd>
          </>
        ) : null}
        {site.phone ? (
          <>
            <dt>Phone</dt>
            <dd>
              <a href={`tel:${site.phone.replace(/[^+\d]/g, '')}`}>{site.phone}</a>
              {site.phone2 ? (
                <>
                  {', '}
                  <a href={`tel:${site.phone2.replace(/[^+\d]/g, '')}`}>{site.phone2}</a>
                </>
              ) : null}
            </dd>
          </>
        ) : null}
        {site.email ? (
          <>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${site.email}`}>{site.email}</a>
            </dd>
          </>
        ) : null}
        {site.whatsapp ? (
          <>
            <dt>WhatsApp</dt>
            <dd>
              <a href={`https://wa.me/${site.whatsapp.replace(/[^\d]/g, '')}`}>{site.whatsapp}</a>
            </dd>
          </>
        ) : null}
        {site.openingHours ? (
          <>
            <dt>Opening hours</dt>
            <dd>{site.openingHours}</dd>
          </>
        ) : null}
      </dl>
      <h2>Send us a message</h2>
      <p>We reply by email. For an order, include your order number.</p>
      <EnquiryForm kind="contact" turnstileSiteKey={site.turnstileSiteKey} />
    </div>
  );
}
