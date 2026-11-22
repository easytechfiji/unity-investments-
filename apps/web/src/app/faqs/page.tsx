import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { JsonLd } from '../../components/JsonLd';
import { api } from '../../lib/api';
import { pageMetadata } from '../../lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Frequently asked questions',
  description: 'Answers about ordering, paying and collecting from our shop in Nakasi.',
  path: '/faqs',
});

export default async function FaqsPage() {
  const faqs = await api.faqs();
  // FAQPage markup only describes questions and answers that are visible below.
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
  return (
    <div className="wrap page prose">
      {faqs.length ? <JsonLd data={structured} /> : null}
      <Breadcrumbs items={[{ name: 'FAQs', path: '/faqs' }]} />
      <h1>Frequently asked questions</h1>
      {faqs.length === 0 ? (
        <p>
          No questions here yet. <Link href="/contact_us">Ask us directly</Link>.
        </p>
      ) : (
        faqs.map((faq) => (
          <section key={faq.id}>
            <h2>{faq.question}</h2>
            {faq.answer.split(/\n{2,}/).map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
