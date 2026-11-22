import { z } from 'zod';

const booleanString = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((value) => value === 'true');

const origin = z.string().refine((value) => {
  try {
    // An origin is scheme + host + port only, for example https://unityfj.com
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}, 'Must look like https://example.com with no path or trailing slash');

const originList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  )
  .pipe(z.array(origin));

const currency = z.string().regex(/^[A-Z]{3}$/, 'Use a three letter currency code such as NZD');

// PayPal cannot charge FJD, so it is not in this list.
const PAYPAL_CURRENCIES = ['AUD', 'NZD', 'USD', 'EUR', 'GBP', 'CAD', 'JPY', 'SGD', 'HKD'] as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
    // Comma separated list of browser origins allowed to call the API (storefront and admin).
    CORS_ORIGINS: originList,
    // The admin app's origin. Admin requests that change data must come from it.
    ADMIN_ORIGIN: origin.optional(),
    // Public address of the storefront, used for links in emails.
    SITE_URL: origin.default('http://localhost:3000'),
    // Public address of this API, used for locally stored images.
    API_PUBLIC_URL: origin.default('http://localhost:4000'),
    // Number of proxies in front of the API (Cloudflare, the host's load balancer).
    // Needed so rate limiting sees the visitor's IP and not the proxy's.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    // Multiplies every rate limit. Only tests raise it; production must keep 1.
    RATE_LIMIT_SCALE: z.coerce.number().int().min(1).max(1000).default(1),

    // Postgres connection string. Locally the dev database; in production the Supabase pooler.
    DATABASE_URL: z.string().startsWith('postgres').optional(),

    // The currency prices are stored and shown in.
    SHOP_CURRENCY: currency.default('FJD'),
    // Tax is off until the owner confirms VAT handling. When on, TAX_RATE percent is added.
    TAX_ENABLED: booleanString('false'),
    TAX_RATE: z.coerce.number().min(0).max(100).default(0),

    // PayPal. Leave the client id empty to hide PayPal at checkout.
    PAYPAL_ENV: z.enum(['sandbox', 'live']).default('sandbox'),
    PAYPAL_CLIENT_ID: z.string().min(10).optional(),
    PAYPAL_CLIENT_SECRET: z.string().min(10).optional(),
    PAYPAL_WEBHOOK_ID: z.string().min(5).optional(),
    PAYPAL_CURRENCY: z.enum(PAYPAL_CURRENCIES).optional(),
    // Only for tests, which point PayPal calls at a fake server.
    PAYPAL_API_BASE: z.url().optional(),

    // Email
    EMAIL_PROVIDER: z.enum(['resend', 'file', 'memory']).default('file'),
    EMAIL_FROM: z.string().min(3).default('Unity Investment <orders@example.test>'),
    RESEND_API_KEY: z.string().min(10).optional(),
    OUTBOX_DIR: z.string().default('../../.data/outbox'),

    // Cloudflare Turnstile. Empty in development skips the check.
    TURNSTILE_SECRET_KEY: z.string().min(10).optional(),
    TURNSTILE_SITE_KEY: z.string().min(10).optional(),

    // Uploaded images
    STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
    MEDIA_DIR: z.string().default('../../.data/media'),
    SUPABASE_STORAGE_BUCKET: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .default('media'),

    // Promotional videos. A separate bucket, because video is not re-encoded
    // on upload the way images are: the loader script sends an already
    // re-encoded, already small MP4 file straight through.
    VIDEO_DIR: z.string().default('../../.data/media-video'),
    SUPABASE_VIDEO_BUCKET: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .default('videos'),

    // Supabase project URL, for example https://abcd1234.supabase.co
    SUPABASE_URL: z.url({ protocol: /^https$/ }).optional(),
    // Publishable key (older projects call it anon). Needed for Supabase Auth calls.
    SUPABASE_PUBLISHABLE_KEY: z.string().min(20).optional(),
    // Secret key (older projects call it service_role). Bypasses RLS: API server only.
    SUPABASE_SECRET_KEY: z.string().min(20).optional(),
    // Supabase Auth address. Defaults to SUPABASE_URL/auth/v1. Local development
    // points it at the fake auth server in apps/api/dev.
    AUTH_URL: z.url().optional(),
    // Send cookies only over HTTPS. Always true in production.
    COOKIE_SECURE: booleanString('false'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    const require = (key: keyof typeof env, message = 'Required in production') => {
      if (env[key] === undefined || (Array.isArray(env[key]) && env[key].length === 0)) {
        ctx.addIssue({ code: 'custom', path: [key], message });
      }
    };
    require('CORS_ORIGINS');
    if (env.RATE_LIMIT_SCALE !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['RATE_LIMIT_SCALE'],
        message: 'Must be 1 in production',
      });
    }
    require('ADMIN_ORIGIN');
    require('DATABASE_URL');
    require('TURNSTILE_SECRET_KEY');
    require('TURNSTILE_SITE_KEY');
    require('SUPABASE_URL');
    require('SUPABASE_PUBLISHABLE_KEY');
    require('SUPABASE_SECRET_KEY');
    if (env.EMAIL_PROVIDER !== 'resend') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'Must be resend in production',
      });
    }
    require('RESEND_API_KEY');
    if (env.STORAGE_DRIVER !== 'supabase') {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_DRIVER'],
        message: 'Must be supabase in production',
      });
    }
    if (!env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'Must be true in production',
      });
    }
    if (env.AUTH_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_URL'],
        message: 'Use SUPABASE_URL in production',
      });
    }
    if (env.PAYPAL_API_BASE) {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYPAL_API_BASE'],
        message: 'Not allowed in production',
      });
    }
    if (
      env.PAYPAL_CLIENT_ID &&
      (!env.PAYPAL_CLIENT_SECRET || !env.PAYPAL_WEBHOOK_ID || !env.PAYPAL_CURRENCY)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYPAL_CLIENT_ID'],
        message: 'PayPal also needs PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID and PAYPAL_CURRENCY',
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/**
 * Reads and checks settings once at startup. The error lists the setting
 * names that are wrong, never their values, so secrets cannot end up in logs.
 */
export function loadConfig(source: Record<string, string | undefined>): AppConfig {
  // Treat `NAME=` (empty) the same as not set, so a copied .env.example uses the defaults.
  const present = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse(present);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new ConfigError(`Invalid API configuration:\n${problems}`);
  }
  return result.data;
}

export function authUrl(config: AppConfig): string | null {
  if (config.AUTH_URL) return config.AUTH_URL.replace(/\/$/, '');
  return config.SUPABASE_URL ? `${config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1` : null;
}

export function paypalEnabled(config: AppConfig): boolean {
  return Boolean(config.PAYPAL_CLIENT_ID && config.PAYPAL_CLIENT_SECRET && config.PAYPAL_CURRENCY);
}
