import { headers } from 'next/headers';

/**
 * Structured data for Google, rendered on the server. JSON.stringify output is
 * not HTML, so "<" is escaped to stop a product name from closing the script
 * tag. This is the one deliberate use of dangerouslySetInnerHTML besides
 * sanitised descriptions.
 */
export async function JsonLd({ data }: { data: unknown }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return (
    <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: json }} />
  );
}
