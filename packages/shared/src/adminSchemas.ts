import { z } from 'zod';
import { emailSchema, idSchema, slugSchema } from './schemas.js';

// Admin form fields use the database column names, so the API can map them
// straight to columns from these trusted definitions.

const text = (max: number) =>
  z.string().trim().min(1, 'Required').max(max, `Use ${max} characters or fewer`);

/** Optional text: an empty box is stored as null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer`)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

export const moneyInput = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter an amount such as 12.50');

const sortOrder = z.coerce.number().int().min(-1000).max(100000).default(0);

const sitePath = z
  .string()
  .trim()
  .max(500)
  .regex(/^\/[^?#\s]*$/, 'Must start with / and contain no spaces');

const linkInput = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => value === '' || value.startsWith('/') || /^https:\/\/[^\s]+$/.test(value),
    'Use a site path such as /collection or a full https link',
  )
  .nullable()
  .optional()
  .transform((value) => (value ? value : null));

export const adminCategorySchema = z.strictObject({
  name: text(200),
  slug: slugSchema,
  description: optionalText(2000),
  popular: z.boolean().default(false),
  status: z.boolean().default(true),
  sort_order: sortOrder,
  meta_title: optionalText(80),
  meta_description: optionalText(200),
});

export const adminSubcategorySchema = adminCategorySchema.extend({ category_id: idSchema });

export const adminAttributeValueSchema = z.strictObject({
  attribute_id: idSchema,
  name: text(100),
  status: z.boolean().default(true),
});

export const adminBannerSchema = z.strictObject({
  name: optionalText(200),
  description: optionalText(500),
  link: linkInput,
  status: z.boolean().default(true),
  sort_order: sortOrder,
});

export const adminFaqSchema = z.strictObject({
  question: text(300),
  answer: text(3000),
  status: z.boolean().default(true),
  sort_order: sortOrder,
});

export const PAGE_KINDS = ['about', 'delivery', 'privacy', 'terms'] as const;

export const adminPageSchema = z.strictObject({
  kind: z.enum(PAGE_KINDS),
  name: text(200),
  slug: slugSchema,
  body: optionalText(50000),
  status: z.boolean().default(true),
  meta_title: optionalText(80),
  meta_description: optionalText(200),
});

export const adminShippingRegionSchema = z.strictObject({
  region_name: text(100),
  description: optionalText(300),
  price: moneyInput,
  status: z.boolean().default(true),
  sort_order: sortOrder,
});

export const adminTestimonialSchema = z.strictObject({
  name: text(100),
  body: text(1000),
  status: z.boolean().default(false),
});

export const adminRedirectSchema = z
  .strictObject({ from_path: sitePath, to_path: sitePath })
  .refine((value) => value.from_path !== value.to_path, {
    message: 'From and to must differ',
    path: ['to_path'],
  });

export const adminProductSchema = z
  .strictObject({
    category_id: idSchema,
    subcategory_id: idSchema,
    type: z.enum(['simple', 'variable']).default('simple'),
    name: text(300),
    slug: slugSchema,
    sku: optionalText(64),
    small_description: optionalText(500),
    description: optionalText(50000),
    buyers_guide: optionalText(50000),
    original_price: moneyInput,
    sale_price: moneyInput
      .nullable()
      .optional()
      .transform((value) => (value && Number(value) > 0 ? value : null)),
    color_id: idSchema
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    size_id: idSchema
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    stock: z.coerce.number().int().min(0).max(1_000_000).default(0),
    // in_stock: shows the count and can be bought. arriving_soon: quotation only, no count.
    availability: z.enum(['in_stock', 'arriving_soon']).default('in_stock'),
    tax: z.coerce.number().min(0).max(100).default(0),
    status: z.boolean().default(true),
    trending: z.boolean().default(false),
    featured: z.boolean().default(false),
    // Pins a product to the home page display section and to the top of the Recommended order.
    spotlight: z.boolean().default(false),
    // Manual rank for the Recommended order. Lower shows first. 1000 means no particular rank.
    sort_rank: z.coerce.number().int().min(0).max(100000).default(1000),
    // Comma separated sizes offered on the enquiry form, for a quote-only product with many sizes.
    quote_size_options: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : null,
      ),
    meta_title: optionalText(80),
    meta_description: optionalText(200),
    meta_keywords: optionalText(200),
  })
  .refine((value) => !value.sale_price || Number(value.sale_price) < Number(value.original_price), {
    message: 'The sale price must be lower than the regular price',
    path: ['sale_price'],
  });

export const adminVariantSchema = z
  .strictObject({
    id: idSchema.optional(),
    sku: optionalText(64),
    color_id: idSchema
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    size_id: idSchema
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    price: moneyInput,
    stock: z.coerce.number().int().min(0).max(1_000_000),
  })
  .refine((value) => value.color_id !== null || value.size_id !== null, {
    message: 'Choose a colour, a size or both',
    path: ['color_id'],
  });

export const adminVariantsSchema = z.strictObject({
  variants: z.array(adminVariantSchema).max(200),
});

export const ORDER_STATES = ['pending', 'processing', 'completed', 'cancelled'] as const;

export const adminOrderStateSchema = z.strictObject({ state: z.enum(ORDER_STATES) });

export const adminSettingsSchema = z.strictObject({
  site_name: text(200),
  phone: optionalText(40),
  phone_2: optionalText(40),
  email: emailSchema
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  address: optionalText(300),
  opening_hours: optionalText(300),
  facebook_url: linkInput,
  instagram_url: linkInput,
  whatsapp: optionalText(40),
  bank_account_name: optionalText(100),
  bank_name: optionalText(100),
  bank_branch_code: optionalText(40),
  bank_account_number: optionalText(60),
  legal_name: optionalText(200),
  tin: optionalText(40),
  bank_swift: optionalText(20),
  mpaisa_number: optionalText(40),
  paypal_fx_rate: z
    .string()
    .trim()
    .regex(/^(\d{1,6}(\.\d{1,6})?)?$/, 'Enter a rate such as 0.44')
    .nullable()
    .optional()
    .transform((value) => (value && Number(value) > 0 ? value : null)),
  sale_active: z.boolean().default(false),
  sale_ends_at: z.iso
    .datetime({ offset: true })
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
});

export type AdminSettings = z.input<typeof adminSettingsSchema>;

// Documents (update 02, part 4) ------------------------------------------------

const dateInput = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date such as 2026-11-29');

const optionalDate = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Enter a date such as 2026-11-29')
  .nullable()
  .optional()
  .transform((value) => (value ? value : null));

const optionalMoney = moneyInput
  .or(z.literal(''))
  .nullable()
  .optional()
  .transform((value) => (value ? value : null));

/** A saved customer, and the party details typed on a document. */
export const adminPartySchema = z.strictObject({
  name: text(200),
  contact_person: optionalText(200),
  address: optionalText(500),
  country: optionalText(100),
  phone: optionalText(60),
  email: emailSchema
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  tin: optionalText(40),
  notes: optionalText(1000),
});

export const documentLineSchema = z.strictObject({
  description: text(500),
  hs_code: optionalText(20),
  unit: optionalText(20),
  qty: z
    .string()
    .trim()
    .regex(/^\d{1,9}(\.\d{1,3})?$/, 'Enter a quantity such as 2 or 1.5')
    .refine((value) => Number(value) > 0, 'Must be more than 0'),
  unit_price: moneyInput,
});

/** The fields only some document types use. Stored as they are, in documents.fields. */
const documentFields = z
  .strictObject({
    po_number: optionalText(100),
    payment_method: optionalText(40),
    payment_reference: optionalText(200),
    paid_by: optionalText(40),
    reference: optionalText(200),
    being_payment_for: optionalText(300),
    valid_until: optionalDate,
    buyer_ref: optionalText(100),
    incoterms: optionalText(60),
    payment_terms: optionalText(200),
    shipment_by: optionalText(100),
    port_loading: optionalText(100),
    port_discharge: optionalText(100),
    country_origin: optionalText(100),
    deliver_to: optionalText(500),
    required_by: optionalDate,
    taken_by: optionalText(100),
    deposit_method: optionalText(40),
    notes: optionalText(1000),
  })
  .prefault({});

/**
 * A document to preview or issue. Totals are not part of it: the API works them out
 * from the lines. The party details are always sent; party_id says which saved party
 * they came from, if any.
 */
export const adminDocumentSchema = z
  .strictObject({
    type: z.enum(['invoice', 'receipt', 'proforma', 'order']),
    party_id: idSchema
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    party: adminPartySchema,
    /** Save a newly typed party for next time. Ignored when party_id is set. */
    save_party: z.boolean().default(true),
    issue_date: dateInput,
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'Use a three letter code such as FJD or USD')
      .default('FJD'),
    lines: z.array(documentLineSchema).max(200, 'Use 200 lines or fewer').default([]),
    vat_enabled: z.boolean().default(true),
    prices_include_vat: z.boolean().default(true),
    amount: optionalMoney,
    freight: optionalMoney,
    insurance: optionalMoney,
    other_charges: optionalMoney,
    deposit: optionalMoney,
    invoice_id: idSchema
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    fields: documentFields,
  })
  .superRefine((value, ctx) => {
    if (value.type === 'receipt') {
      if (!value.amount || Number(value.amount) <= 0)
        ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter the amount received' });
      if (!value.fields.paid_by)
        ctx.addIssue({
          code: 'custom',
          path: ['fields', 'paid_by'],
          message: 'Choose how it was paid',
        });
      if (!value.fields.being_payment_for && !value.invoice_id)
        ctx.addIssue({
          code: 'custom',
          path: ['fields', 'being_payment_for'],
          message: 'Say what the payment is for',
        });
    } else if (value.lines.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['lines'], message: 'Add at least one line' });
    }
    if (value.type !== 'proforma' && value.currency !== 'FJD')
      ctx.addIssue({
        code: 'custom',
        path: ['currency'],
        message: 'Only a proforma invoice can use another currency',
      });
  });

export type AdminDocumentInput = z.input<typeof adminDocumentSchema>;
export type AdminDocument = z.output<typeof adminDocumentSchema>;

export const adminDocumentSettingsSchema = z.strictObject({
  vat_rate: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, 'Enter a rate such as 12.5')
    .refine((value) => Number(value) <= 100, 'At most 100'),
  prices_include_vat: z.boolean(),
  terms_general: z.string().trim().max(4000),
  terms_proforma: z.string().trim().max(4000),
  next_numbers: z.strictObject({
    invoice: z.coerce.number().int().min(1).max(99999999),
    receipt: z.coerce.number().int().min(1).max(99999999),
    proforma: z.coerce.number().int().min(1).max(99999999),
    order: z.coerce.number().int().min(1).max(99999999),
  }),
});

export const voidDocumentSchema = z.strictObject({
  reason: text(300),
});

export const emailDocumentSchema = z.strictObject({
  /** Another address than the party's. Empty means the party's email. */
  to: emailSchema
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
});
