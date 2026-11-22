# Learning log

## Phase 1. Foundation and data (13 October 2026)

### What we built

- An npm workspace with four packages: `apps/web` (Next.js storefront), `apps/admin` (Vite admin), `apps/api` (Express API) and `packages/shared` (zod schemas used by all three).
- Tooling: strict TypeScript, type-aware ESLint, Prettier, Vitest, Playwright, and a GitHub Actions pipeline that runs all of them plus `npm audit` and a gitleaks secret scan.
- A pre-commit hook (`.githooks/pre-commit`) that blocks commits containing secrets, em dashes or emojis.
- The API security baseline: settings checked at startup, a request id on every request, security headers (helmet), a CORS allow list, rate limits, a body size limit, zod validation, and one error handler that never leaks details.
- The database as seven migrations in `supabase/migrations`, with Row Level Security on every table and `public_*` views as the only thing the public key can read.
- 64 automated tests, including 28 that build the database from the migrations in an in-process Postgres and try to break its rules.

### Key ideas

- **Validate at the edge.** Anything from outside (a request body, an environment variable) is checked against a zod schema before the code uses it. Bad input becomes a clean 400, never a crash.
- **Fail closed.** The database starts with no access for the browser keys and we add only what the public site needs. The API refuses to start with bad settings rather than running half configured.
- **Two layers, not one.** Browser roles have no table rights at all, and RLS is on as well. A mistake in one layer is caught by the other. A mutation test showed the tests fail if either layer is removed.
- **The database guards its own rules.** Check constraints stop negative stock, bad slugs, and order totals that do not add up, even if the API has a bug.
- **No personal data in logs.** The logger records method, path, status and request id only. Unexpected errors are logged without their message in production, because database messages can quote customer data.

### Why this way

- No SQL dump came with the handover, so the catalogue starts from scratch and is entered through the admin. The old sitemap (30 URLs) is kept for redirects.
- PGlite runs real Postgres inside Node, so database tests need no Docker and run in CI in seconds. The hosted Supabase staging project is the final check.
- The public views run with the owner's rights on purpose: they are the filter that decides which rows and columns are public.

### Questions a tutor might ask

1. **Why does the browser cart schema have no price field?**
   Because anyone can edit what their browser sends. The server looks up prices in the database. The schema is strict, so a request that includes a price is rejected outright.
2. **If RLS is on, why also revoke table rights from anon?**
   Supabase grants every new table to the browser roles by default. If someone later creates a table and forgets RLS, the revoked default rights still keep it closed. Defence in depth means one mistake is not enough.

### Still open

- Currency PayPal charges (`SHOP_CURRENCY`): old code charged NZD, `.env` said AUD, prices showed a bare `$`.
- Tax: off by default; old code had a commented out 10 percent line.
- Delivery region names and prices: only existed in the old database.
- Logo and brand colour confirmation (old accent `#ff3c20`; logo files are in `legacy/`).
- Hosted Supabase staging project: migrations and the RLS test still need a run against real Supabase.
- CI has not run on GitHub yet, because nothing is committed.

## Phase 2. Public storefront (13 October 2026)

### What we built

- A Next.js storefront: home, all categories, category and subcategory pages with filters, sorting and numbered pages, product pages with variants, search, cart, About, FAQs, Delivery, Contact, Privacy, an HTML sitemap and a real 404 page.
- The design from Appendix A, in the logo's colours: navy for the brand, red only for main buttons, sale prices and the focus ring. Barlow fonts self hosted. Seven hand drawn icons. Square corners and thin grey rules instead of shadows.
- SEO: a title, description and canonical on every page, JSON-LD (Store, WebSite, BreadcrumbList, Product, FAQPage), a `sitemap.xml` built from the database, `robots.txt`, 301 redirects for old addresses, and a redirects table the admin can add to.
- A Content Security Policy with a fresh nonce on every request (`src/proxy.ts`).

### Key ideas

- **Server rendering.** Google gets the finished HTML, with the product name and price in it, without running any JavaScript.
- **Data cache.** Pages are rendered per request (the nonce needs that), but the catalogue data behind them is cached for 60 seconds, so pages are fast and admin changes show within a minute.
- **Progressive enhancement.** Filters, sorting and pagination are plain links and GET forms, so they work, and are crawlable, without JavaScript.
- **Content Security Policy.** The browser runs only scripts that carry this request's nonce, so an injected script cannot run.

### Why this way

- The storefront reads the catalogue through the API rather than straight from Supabase, so there is one way into the data, and the API runs those reads as the public `anon` role anyway.
- Inline CSS (a Next.js option that would save about 0.4 s on slow phones) was tried and rejected: Next.js does not add the nonce to the inline style, so the strict policy blocks all styles.
- Placeholder sample products (SKU `SAMPLE-...`) let the pages be built and tested before real products exist. `npm run db:remove-samples` deletes them.

### Questions a tutor might ask

1. **Why not a plain React single page app?** Its HTML is empty until JavaScript runs; search engines and slow phones both suffer. Server rendering sends the finished page.
2. **Why are filtered pages `noindex`?** Every filter combination is a new URL with almost the same content. Indexing them spreads ranking thin and wastes Google's crawl; `noindex, follow` keeps the links followable without the duplicates.

### Results

Lighthouse on mobile, production build: performance 94 to 96, accessibility 100, best practices 100, SEO 100 (with indexing allowed, as in production). Largest contentful paint 2.6 to 2.8 s (target 2.5 s), layout shift 0. Axe: no issues of any level on 15 pages. Screenshots at 360, 768 and 1280 pixels reviewed.

## Phase 3. Orders, payments and admin (13 October 2026)

### What we built

- Cart in the browser (product id, variant id and quantity only), priced by the API every time.
- One page checkout with Fiji addresses (division instead of state, no postcode), Click And Collect or delivery by region, bank transfer or PayPal.
- PayPal: the server creates the order with its own amount, captures it, and checks amount and currency before marking it paid. PayPal cannot charge FJD, so it charges a configured currency at a rate set in the admin, shown to the customer first and stored on the order.
- Stock taken atomically, emails to the customer and the shop only, PDF invoices made on demand, order lookup with reference plus email.
- The admin app: sign in with password and authenticator code, dashboard, orders (status, mark paid, invoice, trash), products with variants and photos, Excel import and export, categories and the other lists, settings including bank details, and an activity log nobody can change.

### Key ideas

- **Never trust the browser with money.** Prices, totals, delivery and stock are worked out from the database on every request.
- **Atomic update.** `update ... set stock = stock - n where id = ... and stock >= n` checks and changes in one step, so two buyers cannot both get the last item.
- **Idempotency.** A checkout token, PayPal request ids and stored webhook event ids make repeats harmless: one order, one payment, one email.
- **Two factor sign in.** A password alone is not enough; the session must also have passed an authenticator code (`aal2`) and belong to a row in `admin_profiles`.
- **HttpOnly cookies.** The admin session lives in cookies the page's JavaScript cannot read, so a script injected into the admin could not steal it.

### Questions a tutor might ask

1. **What happens if PayPal sends the same "payment completed" message twice?** The event id is stored in `payment_events` with a unique key; the second insert does nothing, so the handler stops there. The update to paid also only happens when the order is not already paid.
2. **Why take stock before capturing a PayPal payment, not after?** If the item has sold out meanwhile, we refuse before any money moves. The reverse order would mean taking money for something we cannot send.

### Tests

156 unit and integration tests (real Postgres) and 53 browser tests. The brief's cheat tests all pass: changed price, negative quantity, over-stock, replayed webhook, admin routes without login, reading another customer's order.

## Phase 4. Hardening and launch preparation (13 October 2026)

### What we did

- `docs/SECURITY-REVIEW.md`: every Appendix B item with its status and evidence.
- OWASP ZAP baseline scan: no high, medium or low findings. One informational note (forms falling back to GET without JavaScript) was fixed.
- Backups: `npm run db:backup` and a restore test that compares every table. It found a real gap (admin accounts were not in the backup), which was fixed; the restore then matched on all 20 tables and kept the security rules.
- `docs/DEPLOYMENT.md`, `docs/CUTOVER.md` and `docs/OLD-URLS.md` for going live.

### Key ideas

- **A backup is only proven by a restore.** The first restore test failed for a reason no one would have noticed until the day it mattered.
- **Passive versus active scanning.** A baseline scan only reads responses; an active scan sends attacks. Baseline is safe to run against staging at any time.

### Still open

- Accounts and keys: Supabase, PayPal (and which currency it charges), Resend, Turnstile.
- Real delivery prices, bank details (in the admin), the real catalogue with the old slugs (docs/OLD-URLS.md), the vector logo.
- Rotating the old PayPal keys and database password. Monitoring and alerts. Cloudflare and DNS on launch day.
- VAT decision; retention period for old orders.

## Update 01. Featured displays and a Recommended order (1 November 2026)

### What we built

- A "Recommended" product order (spotlight, then trending, then a manual rank, then name) and a sort control (Recommended, price, name, newest) on `/products` (new, the catalogue's indexable "all products" page), category and subcategory pages.
- A home page section, straight after the hero, for the two JCVision display products (interactive smart board, 49 inch advertising screen), both "Request a quote" only.
- `product_videos`: short promotional clips with a poster image and a plain text transcript, playable on the product page only on request (no autoplay).
- `scripts/db/displays.mjs` (`npm run db:seed:displays`): loads the category, subcategories, the two products and their photo and video, matched by slug and title so it is safe to run twice.

### Key ideas

- **A stable sort needs a tie-break.** Every `ORDER BY` ends with `id asc` (or `id desc`). Without it, two rows that compare equal on every other column can swap places between page 1 and page 2 of the same list, so a product can appear twice or go missing.
- **Sorted and filtered pages are `noindex, follow`.** `?sort=price_asc` is almost the same content as the plain page at a different address; indexing both would be duplicate content. `follow` keeps the links crawlable so Google still finds every product through pagination.
- **Video lives in Storage, not on the API.** The Render API host has limited memory and sleeps on the free plan; streaming video through it would be slow and wasteful. The browser fetches video straight from Supabase Storage (or, in development, a small static folder on the API, the same way product photos already work).
- **`preload="none"` plus a poster image.** The browser downloads nothing until the visitor presses play, so a product page with a video is not slower than one without. The poster (a still frame, stored and resized the same way a product photo is) is what shows before that.
- **A transcript is not decoration.** It is the accessibility alternative for anyone who cannot or does not play the video, so a video is only loaded with one if someone has actually watched it and written down what it says. Guessing at a transcript would be worse than no video.

### Questions a tutor might ask

1. **Why does the Recommended order need a manual rank at all, instead of just "spotlight" and "trending" flags?** Those two are only on or off, so every spotlighted product would tie with every other spotlighted product. The rank number breaks that tie in the order the owner actually wants, without needing sales data the shop does not have yet.
2. **Why can a product have a price of 0 and still not be bought?** 0 means "request a quote," not "free." The cart pricing code already treats a 0 price as a `quote_only` problem and refuses to add it to an order, the same way it already refused `reception-counter` (a sample quote-only product) before this update.

### Tests

173 unit and integration tests pass (up from before this update), including new ones for: the Recommended order itself, that every sort gives page 2 with no repeats and no gaps, the `/spotlight` endpoint, that `OD-DISPLAY-01` cannot be bought, and that RLS still hides `product_videos` from the anon role except through the published view. Checked live against the local database: the loader ran twice without duplicating anything, the home page, `/products` and both product pages rendered correctly, the CSP `media-src` line was present with no console errors, and a normal (non quote-only) product page's "Add to cart" still worked.

### Still open

- **No photo exists yet for the interactive smart board.** It shows "Photo coming soon." The only photo found for the 49 inch screen is a dark, stylised AI-rendered image with no supplier branding visible (two other candidate images had the JCVision logo printed on the physical unit and third-party ad content on the screen itself, so they were not used). Real photos of both units are needed before launch.
- **Only one of three board videos was loaded.** The main 24 second video has a real transcript and was loaded. The second (15 second) video is music and on-screen text only, and nobody has watched it yet to write an honest transcript, so it stays out rather than guessing. Re-encoding and the poster frame both need `ffmpeg` installed on the computer that runs the loader; it was not installed in the environment this was built in, so that one video was skipped automatically with a clear message rather than loaded badly.
- **Every video of the 49 inch screen shows it being sprayed with water** (an animation, not a real test). None are loaded. Do not publish one and do not write "waterproof" until JCVision confirms the IP rating in writing.
- **The sales deck still says 4K for the 49 inch screen; the spec table on the new page says Full HD 1080p**, matching what Sultan chose on 2 October. Confirm with the supplier in writing so the website, the deck and any quote agree.
- **Whether the 8-microphone array applies to every smart board size**, given the 75 inch unit's microphone was flagged as weak for conferences, and whether sizes 100, 105 and 110 inch can really be supplied (the supplier page lists up to 98 inch).
- The starting Recommended order (two displays, then 12 other products by rank) is a guess from what has been advertised most, not sales data. Sultan should reorder it in the admin (Products, Spotlight and Recommended order rank fields) whenever he wants.
- Admin video upload was not built (the loader script covers the first release); worth asking Sultan whether that is wanted later, the same way product photo upload already works.

## Conversion to the Unity Investment shop (20 November 2026)

The working shop code was copied in from Sultan's earlier office supplies shop and rebranded for Unity Investment. No shop logic was changed. What changed:

- **Secrets and data first.** The copy skipped the old shop's `.env` files, local database (`.data/`), git history, build output and `node_modules`. New empty `.env` files were made from the `.env.example` files, and dependencies were installed fresh.
- **Branding.** The site name, header, page wording, meta descriptions, admin login, security contact and email sender now say Unity Investment, Nakasi and unityfj.com. Contact details come from the database settings row, which a fresh database now starts with.
- **Logo and colours.** The old VAULT logo is wide (emblem plus wordmark), so the brand script was rewritten to cut out the round emblem for the square files (header logo, favicons) and use the full logo on the share image. The logo blue and orange fail text contrast on white, so the site uses darker shades of the same colours.
- **Categories.** The VAULT category pictures replace the old shop's, keyed by the same slugs the VAULT site used, and `/category/<slug>` now redirects to `/collection/<slug>`.
- **Kept the repository.** This folder already held the VAULT site with its git history, so instead of deleting `.git` (step 1 of the setup guide) the work was done on a new local branch.

### Questions a tutor might ask

1. **Why copy the code instead of building the new shop from scratch?** The original shop already has tested checkout, payments, admin, security and SEO. Reusing it means only configuration changes, which are much less likely to introduce bugs than rewriting working logic.
2. **Why are the environment files empty in git?** Keys are secrets per business and per environment (local, staging, production). The code reads them at startup, so the same code runs any shop; committing them would leak them to anyone who can read the repository.

### Still open

- Keys in the `.env` files, a Supabase project for the shop, the first admin account and storage buckets.
- Decided: the shop email is unityfiji.info@gmail.com. Site emails are still sent from orders@unityfj.com, because Resend can only send from a domain you own; customer replies go to the Gmail inbox.

## Moving to the new Supabase project (21 November 2026)

### What we did

- Backed up the old VAULT Supabase project before deleting it (the free plan allows only two
  projects): every row its public key could read (6 categories, 54 items) and all 54 photos.
- `npm run import:vault -- --from <folder>` now reads that saved copy instead of the live VAULT
  API, so the import still works after VAULT is gone. Tested twice on a throwaway database: 47
  products with photos the first time, nothing duplicated the second.
- Set up the new Supabase project: all 8 migrations, the `media` and `videos` buckets
  (`npm run storage:buckets`), and the 47 bedding products. Checked afterwards: 47 products, and
  all 47 photos download from the public bucket.
- Contact details changed to +679 992 4441 (phone and WhatsApp), in both databases and in the
  starting copy in the content migration.
- Filled the local `.env` files with local only values so `npm run dev` works.

### Key ideas

- **Back up before you delete, then prove the copy.** The backup was only trusted after every
  bedding photo was found in it and an import from it gave the same 47 products as the live site.
- **A public key only sees what Row Level Security allows.** VAULT's policy showed only
  `is_active = true` items, so switched off items could not be backed up with that key.
- **Settings in the database, not in code.** Changing the phone number was a data update, not a
  code change; the migration only seeds a brand new database.

### Questions a tutor might ask

1. **Why add a `--from` option instead of writing a second import script?** The rules for
   turning an old item into a shop product (slug, subcategory, price 0, photo re-encoding) stay
   in one place. Only where the data is read from changes.
2. **Why did the home page show the old number for a minute?** The storefront caches API reads
   for 60 seconds (`revalidate` in `apps/web/src/lib/api.ts`), so a settings change appears
   within a minute without a rebuild.

### Still open

- The owner admin account on the new Supabase project (needs the email and name).
- API host, Vercel, Resend, Turnstile and PayPal keys; then `docs/DEPLOYMENT.md` and
  `docs/CUTOVER.md`.
