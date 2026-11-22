import {
  checkoutSchema,
  contactFormSchema,
  orderLookupSchema,
  paypalCaptureSchema,
  priceRequestSchema,
  quoteFormSchema,
  slugSchema,
} from '@od/shared';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { headerSafe } from '../lib/email.js';
import { HttpError } from '../lib/errors.js';
import { renderInvoice } from '../lib/invoice.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { parseInput } from '../lib/validate.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { SORTS, type SortKey } from '../services/catalogue.js';
import type { Services } from '../services/container.js';
import { deliveryAndTotals, priceLines, toPublicCart } from '../services/pricing.js';
import { loadPrivateSettings, loadSiteInfo } from '../services/settings.js';

const PAGE_SIZE = 24;

const money = z.string().regex(/^\d{1,8}(\.\d{1,2})?$/);

const productQuerySchema = z.strictObject({
  category: slugSchema.optional(),
  subcategory: slugSchema.optional(),
  q: z.string().trim().max(100).optional(),
  min: money.optional(),
  max: money.optional(),
  inStock: z.enum(['1', 'true']).optional(),
  sort: z.enum(Object.keys(SORTS) as [SortKey, ...SortKey[]]).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
});

const pathSchema = z.strictObject({
  path: z
    .string()
    .max(500)
    .regex(/^\/[^?#]*$/),
});

// Catalogue reads can be cached briefly by browsers and the storefront.
function cacheable(res: Response, seconds = 60): void {
  res.set('Cache-Control', `public, max-age=${seconds}`);
}

function notFound(): HttpError {
  return new HttpError(404, 'not_found', 'Not found.');
}

export function publicRoutes(services: Services): Router {
  const { config, db, catalogue, orders, media, mailer, logger } = services;
  const router = Router();

  // Separate counters per group, so contact form spam cannot block checkout.
  const scale = config.RATE_LIMIT_SCALE;
  const formLimit = createRateLimit({ windowMinutes: 10, limit: 5, scale });
  const checkoutLimit = createRateLimit({ windowMinutes: 10, limit: 20, scale });
  const lookupLimit = createRateLimit({ windowMinutes: 10, limit: 10, scale });

  // Catalogue ----------------------------------------------------------------

  router.get('/site', async (_req, res) => {
    cacheable(res);
    res.json(await loadSiteInfo(db, config));
  });

  router.get('/menu', async (_req, res) => {
    cacheable(res);
    res.json(await catalogue.getMenu());
  });

  router.get('/home', async (_req, res) => {
    cacheable(res);
    res.json(await catalogue.getHome());
  });

  router.get('/spotlight', async (_req, res) => {
    cacheable(res);
    res.json(await catalogue.getSpotlight());
  });

  router.get('/categories', async (_req, res) => {
    cacheable(res);
    res.json(await catalogue.getCategories());
  });

  router.get('/categories/:slug', async (req, res) => {
    const slug = parseInput(slugSchema, req.params.slug);
    const page = await catalogue.getCategory(slug);
    if (!page) throw notFound();
    cacheable(res);
    res.json(page);
  });

  router.get('/categories/:category/:subcategory', async (req, res) => {
    const category = parseInput(slugSchema, req.params.category);
    const subcategory = parseInput(slugSchema, req.params.subcategory);
    const page = await catalogue.getSubcategory(category, subcategory);
    if (!page) throw notFound();
    cacheable(res);
    res.json(page);
  });

  router.get('/products', async (req, res) => {
    const query = parseInput(productQuerySchema, req.query);
    cacheable(res);
    res.json(
      await catalogue.listProducts({
        category: query.category,
        subcategory: query.subcategory,
        search: query.q,
        minPrice: query.min,
        maxPrice: query.max,
        inStock: Boolean(query.inStock),
        sort: query.sort ?? (query.q ? 'name_asc' : 'recommended'),
        page: query.page ?? 1,
        pageSize: query.pageSize ?? PAGE_SIZE,
      }),
    );
  });

  router.get('/products/:slug', async (req, res) => {
    const product = await catalogue.getProduct(parseInput(slugSchema, req.params.slug));
    if (!product) throw notFound();
    cacheable(res);
    res.json(product);
  });

  router.get('/regions', async (_req, res) => {
    cacheable(res);
    res.json(await catalogue.getRegions());
  });

  router.get('/faqs', async (_req, res) => {
    cacheable(res);
    res.json(await catalogue.getFaqs());
  });

  router.get('/pages/:kind', async (req, res) => {
    const kind = parseInput(z.enum(['about', 'delivery', 'privacy', 'terms']), req.params.kind);
    const page = await catalogue.getPage(kind);
    if (!page) throw notFound();
    cacheable(res);
    res.json(page);
  });

  router.get('/redirects', async (req, res) => {
    const { path } = parseInput(pathSchema, req.query);
    cacheable(res);
    res.json({ to: await catalogue.findRedirect(path) });
  });

  router.get('/sitemap', async (_req, res) => {
    cacheable(res, 300);
    res.json(await catalogue.getSitemap());
  });

  // Cart and checkout --------------------------------------------------------

  router.post('/cart/price', async (req, res) => {
    const input = parseInput(priceRequestSchema, req.body);
    const settings = await loadPrivateSettings(db);
    const priced = await db.tx(async (client) => {
      const cart = await priceLines(client, media, input.lines, { lock: false });
      const totals = await deliveryAndTotals(client, config, cart.subtotalCents, input);
      return toPublicCart(config, cart, totals, settings.paypalFxRate);
    });
    res.set('Cache-Control', 'no-store').json(priced);
  });

  router.post('/orders', checkoutLimit, async (req, res) => {
    const input = parseInput(checkoutSchema, req.body);
    const created = await orders.createOrder(input);
    res.status(201).set('Cache-Control', 'no-store').json(created);
  });

  router.post('/orders/lookup', lookupLimit, async (req, res) => {
    const { reference, email } = parseInput(orderLookupSchema, req.body);
    const summary = await orders.lookup(reference, email);
    res.set('Cache-Control', 'no-store').json(summary);
  });

  router.post('/orders/invoice', lookupLimit, async (req, res) => {
    const { reference, email } = parseInput(orderLookupSchema, req.body);
    const summary = await orders.lookup(reference, email);
    const settings = await loadPrivateSettings(db);
    const pdf = await renderInvoice(summary, {
      siteName: settings.siteName,
      address: settings.address,
      phone: settings.phone,
      email: settings.shopEmail,
    });
    res
      .set('Cache-Control', 'no-store')
      .set('Content-Type', 'application/pdf')
      .set('Content-Disposition', `attachment; filename="invoice-${summary.orderNumber}.pdf"`)
      .send(pdf);
  });

  router.post('/orders/paypal/capture', checkoutLimit, async (req, res) => {
    const { reference, paypalOrderId } = parseInput(paypalCaptureSchema, req.body);
    res.set('Cache-Control', 'no-store').json(await orders.capturePaypal(reference, paypalOrderId));
  });

  router.post('/paypal/webhook', async (req, res) => {
    const header = (name: string) => {
      const value = req.headers[name];
      return typeof value === 'string' ? value : '';
    };
    const verified = await services.paypal.verifyWebhook(
      {
        authAlgo: header('paypal-auth-algo'),
        certUrl: header('paypal-cert-url'),
        transmissionId: header('paypal-transmission-id'),
        transmissionSig: header('paypal-transmission-sig'),
        transmissionTime: header('paypal-transmission-time'),
      },
      req.body,
    );
    if (!verified) {
      logger.warn('paypal webhook signature rejected', { requestId: res.locals.requestId });
      throw new HttpError(400, 'bad_signature', 'Signature check failed.');
    }
    const result = await orders.handleWebhook(
      req.body as Parameters<typeof orders.handleWebhook>[0],
    );
    res.json({ result });
  });

  // Public forms ---------------------------------------------------------------

  async function checkForm(
    token: string | undefined,
    honeypot: string | undefined,
    ip: string | undefined,
  ): Promise<boolean> {
    // A filled honeypot means a bot. Pretend it worked so the bot learns nothing.
    if (honeypot) return false;
    if (!(await verifyTurnstile(config, token, ip))) {
      throw new HttpError(
        400,
        'captcha_failed',
        'Please complete the check that you are not a robot, then try again.',
      );
    }
    return true;
  }

  router.post('/forms/contact', formLimit, async (req, res) => {
    const form = parseInput(contactFormSchema, req.body);
    if (await checkForm(form.turnstileToken, form.website, req.ip)) {
      const settings = await loadPrivateSettings(db);
      if (!settings.shopEmail)
        throw new HttpError(
          503,
          'not_configured',
          'The contact form is not set up yet. Please phone us.',
        );
      await mailer.send({
        to: settings.shopEmail,
        subject: headerSafe(`Website enquiry${form.subject ? `: ${form.subject}` : ''}`),
        replyTo: form.email,
        // Plain text only: the visitor's words are never sent as HTML.
        text: [
          `Name: ${form.name}`,
          `Email: ${form.email}`,
          `Phone: ${form.phone ?? 'not given'}`,
          '',
          form.message,
        ].join('\n'),
      });
    }
    res.json({ ok: true });
  });

  router.post('/forms/quote', formLimit, async (req, res) => {
    const form = parseInput(quoteFormSchema, req.body);
    if (await checkForm(form.turnstileToken, form.website, req.ip)) {
      const settings = await loadPrivateSettings(db);
      if (!settings.shopEmail)
        throw new HttpError(
          503,
          'not_configured',
          'Quote requests are not set up yet. Please phone us.',
        );
      const [product] = form.productId
        ? await db.asAnon((client) =>
            client
              .query<{ name: string; sku: string | null }>(
                'select name, sku from public.public_products where id = $1',
                [form.productId],
              )
              .then((result) => result.rows),
          )
        : [];
      await mailer.send({
        to: settings.shopEmail,
        subject: headerSafe(`Quote request${product ? `: ${product.name}` : ''}`),
        replyTo: form.email,
        text: [
          `Name: ${form.name}`,
          `Email: ${form.email}`,
          `Phone: ${form.phone ?? 'not given'}`,
          product ? `Product: ${product.name}${product.sku ? ` (SKU ${product.sku})` : ''}` : null,
          form.size ? `Size: ${form.size}` : null,
          form.quantity ? `Quantity: ${form.quantity}` : null,
          '',
          form.message,
        ]
          .filter((line) => line !== null)
          .join('\n'),
      });
    }
    res.json({ ok: true });
  });

  return router;
}
