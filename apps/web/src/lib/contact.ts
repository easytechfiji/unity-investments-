import type { SiteInfo } from '@od/shared';

/** Call and WhatsApp links built from the shop settings. Null when a number is not set. */
export function contactLinks(site: Pick<SiteInfo, 'phone' | 'whatsapp'>) {
  return {
    phone: site.phone,
    phoneHref: site.phone ? `tel:${site.phone.replace(/[^+\d]/g, '')}` : null,
    whatsapp: site.whatsapp,
    whatsappHref: site.whatsapp ? `https://wa.me/${site.whatsapp.replace(/\D/g, '')}` : null,
  };
}

export type ContactLinks = ReturnType<typeof contactLinks>;
