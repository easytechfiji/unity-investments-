import type { ContactLinks } from '../lib/contact';

/**
 * "Ask for a delivery quote by phone or WhatsApp", with whichever of the two
 * the shop has set. Used while no delivery regions are priced in the admin.
 */
export function DeliveryQuote({ contact }: { contact: ContactLinks }) {
  const ways = [
    contact.phoneHref ? (
      <a key="phone" href={contact.phoneHref}>
        phone {contact.phone}
      </a>
    ) : null,
    contact.whatsappHref ? (
      <a key="whatsapp" href={contact.whatsappHref}>
        WhatsApp {contact.whatsapp}
      </a>
    ) : null,
  ].filter((way) => way !== null);

  if (ways.length === 0) return <>For delivery, contact us for a quote.</>;
  return (
    <>
      For delivery, ask us for a quote by {ways[0]}
      {ways[1] ? <> or {ways[1]}</> : null}.
    </>
  );
}
