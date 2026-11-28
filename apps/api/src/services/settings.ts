import type { BankDetails, SiteInfo } from '@od/shared';
import type { PdfBusiness } from '../lib/documentPdf.js';
import type { AppConfig } from '../config/env.js';
import { paypalEnabled } from '../config/env.js';
import type { Client, Db } from '../db.js';
import { rows } from '../db.js';

export interface PrivateSettings {
  siteName: string;
  shopEmail: string | null;
  phone: string | null;
  address: string | null;
  bank: BankDetails;
  paypalFxRate: string | null;
  /** Everything printed at the top and in the payment box of a PDF document. */
  business: PdfBusiness;
}

interface SettingsRow {
  site_name: string;
  phone: string | null;
  phone_2: string | null;
  email: string | null;
  address: string | null;
  opening_hours: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  whatsapp: string | null;
  bank_account_name: string | null;
  bank_name: string | null;
  bank_branch_code: string | null;
  bank_account_number: string | null;
  paypal_fx_rate: string | null;
  website_url: string | null;
  legal_name: string | null;
  tin: string | null;
  bank_swift: string | null;
  mpaisa_number: string | null;
  [key: string]: unknown;
}

export class MissingSettingsError extends Error {
  override name = 'MissingSettingsError';
}

/** The settings row must exist. The old site crashed when it was missing; we fail clearly instead. */
export async function loadPrivateSettings(client: Client | Db): Promise<PrivateSettings> {
  const result =
    'tx' in client
      ? await client.query<SettingsRow>('select * from public.site_settings where id = 1')
      : await rows<SettingsRow>(client, 'select * from public.site_settings where id = 1');
  const row = result[0];
  if (!row)
    throw new MissingSettingsError('site_settings row 1 is missing. Run the database migrations.');
  return {
    siteName: row.site_name,
    shopEmail: row.email,
    phone: row.phone,
    address: row.address,
    bank: {
      accountName: row.bank_account_name,
      bankName: row.bank_name,
      branchCode: row.bank_branch_code,
      accountNumber: row.bank_account_number,
    },
    paypalFxRate: row.paypal_fx_rate,
    business: {
      siteName: row.site_name,
      legalName: row.legal_name,
      address: row.address,
      website: row.website_url,
      phone: row.phone,
      phone2: row.phone_2,
      email: row.email,
      tin: row.tin,
      bankAccountName: row.bank_account_name,
      bankName: row.bank_name,
      bankBranchCode: row.bank_branch_code,
      bankAccountNumber: row.bank_account_number,
      bankSwift: row.bank_swift,
      mpaisa: row.mpaisa_number,
    },
  };
}

export async function loadSiteInfo(db: Db, config: AppConfig): Promise<SiteInfo> {
  const [row] = await db.asAnon(async (client) =>
    rows<SettingsRow>(client, 'select * from public.public_site_settings'),
  );
  if (!row)
    throw new MissingSettingsError('site_settings row 1 is missing. Run the database migrations.');
  // The rate is not public, so ask the private table whether PayPal can be offered.
  const [rate] = await db.query<{ paypal_fx_rate: string | null }>(
    'select paypal_fx_rate from public.site_settings where id = 1',
  );
  const paypalAvailable = paypalEnabled(config) && Boolean(rate?.paypal_fx_rate);
  return {
    siteName: row.site_name,
    phone: row.phone,
    phone2: row.phone_2,
    email: row.email,
    address: row.address,
    openingHours: row.opening_hours,
    facebookUrl: row.facebook_url,
    instagramUrl: row.instagram_url,
    whatsapp: row.whatsapp,
    currency: config.SHOP_CURRENCY,
    paypalAvailable,
    paypalClientId: paypalAvailable ? (config.PAYPAL_CLIENT_ID ?? null) : null,
    paypalCurrency: paypalAvailable ? (config.PAYPAL_CURRENCY ?? null) : null,
    turnstileSiteKey: config.TURNSTILE_SITE_KEY ?? null,
  };
}
