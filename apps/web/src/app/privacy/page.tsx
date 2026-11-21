import { sanitizeRichText } from '@od/shared/sanitize';
import type { Metadata } from 'next';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { api } from '../../lib/api';
import { pageMetadata } from '../../lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Privacy',
  description:
    'What personal details we collect when you order or contact us, and how we use them.',
  path: '/privacy',
});

export default async function PrivacyPage() {
  const [page, site] = await Promise.all([api.page('privacy'), api.site()]);
  return (
    <div className="wrap page prose">
      <Breadcrumbs items={[{ name: 'Privacy', path: '/privacy' }]} />
      <h1>Privacy</h1>
      {page?.body ? (
        <div dangerouslySetInnerHTML={{ __html: sanitizeRichText(page.body) }} />
      ) : (
        // A plain description of what this website actually does with personal details.
        <>
          <h2>What we collect</h2>
          <p>
            When you place an order we ask for your name, email address, phone number and, for
            delivery, your address. When you send a message or ask for a quote we ask for your name,
            email address and, if you choose, your phone number.
          </p>
          <h2>How we use it</h2>
          <p>
            We use these details only to process and deliver your order, to send you order emails
            and invoices, and to reply to your messages. Order emails go to you and to our shop
            inbox only.
          </p>
          <h2>Payments</h2>
          <p>
            If you pay with PayPal, you enter your card or PayPal details on PayPal&apos;s own
            pages. We never see or store card numbers.
          </p>
          <h2>Your cart</h2>
          <p>
            Your cart is kept in your own browser. It holds only the products and quantities you
            chose. We do not use advertising cookies.
          </p>
          <h2>How long we keep it</h2>
          <p>We keep order records for as long as the law requires for business and tax records.</p>
          <h2>Questions</h2>
          <p>
            To see, correct or remove the details we hold about you, contact us
            {site.email ? (
              <>
                {' '}
                at <a href={`mailto:${site.email}`}>{site.email}</a>
              </>
            ) : null}
            .
          </p>
        </>
      )}
    </div>
  );
}
