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
