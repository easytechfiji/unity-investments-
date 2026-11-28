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

## The API on Vercel (22 November 2026)

### What we built

- The API now runs on Vercel as a function instead of on a separate server, so the whole shop
  is three Vercel projects (API, storefront, admin) and Supabase. No shop logic changed.
- `apps/api/src/bootstrap.ts`: the start up code (check settings, check the database, build the
  services and the Express app), moved out of `server.ts` so both ways of running use it.
- `apps/api/api/index.js`: the Vercel function. It builds the app once per running copy and
  passes each request to Express. `apps/api/vercel.json` sends every address to it.
- Tested locally by calling the function through a plain Node HTTP server: `/health` and
  `/v1/categories` answered correctly. All 173 tests, lint and typecheck pass.

### Key ideas

- **Serverless function.** There is no machine running all the time. Vercel starts a copy when
  requests arrive, reuses it while it stays warm, and may run several copies at once. That is why
  the app is built once per copy (not per request) and each copy's database pool is small (3).
- **Connection pooling.** Many copies times many connections could exceed Supabase's limit, so
  production uses Supabase's transaction pooler, which shares a few real connections.
- **The API was not removed because it holds the rules.** Prices, totals, stock, orders,
  payments, emails and admin sign in are all worked out there, so the browser can never change
  them. Moving where it runs kept all of that and all its tests.

### Questions a tutor might ask

1. **Why not move the API into the Next.js storefront to have only two projects?** It would mean
   rewriting tested payment, order and sign in code. Hosting the same code differently gave the
   same result (nothing extra to rent) with far less risk.
2. **What do you lose on Vercel?** Requests over 4.5 MB (large photos, most videos) are refused,
   in memory rate limits only count per copy (so a Cloudflare rule is added), and the admin can
   only sign in on the real `unityfj.com` subdomains because its cookie is `SameSite=Strict`.

### Still open

- Deploy the three Vercel projects and set the environment variables (docs/DEPLOYMENT.md).
- Check an invoice PDF downloads on Vercel (the font files are listed in `vercel.json`).
- Owner admin account on the new Supabase project.

## Getting the API to start on Vercel (22 November 2026)

### What happened

- The first deploys crashed with `FUNCTION_INVOCATION_FAILED` and no detail. The entry file was
  changed to load the app inside a `try`, so a failed start answers with a short, safe reason.
  That showed the real error: `ERR_REQUIRE_ESM`, from `sanitize-html` loading `htmlparser2`.
- Two fixes did not work: pinning Node 24 (Vercel still refused), and an npm override to an older
  `htmlparser2` (npm would not apply it). Both were checked and the override was undone.
- The fix that worked: esbuild bundles the API into one file at build time
  (`apps/api/scripts/bundle.mjs`), so that `require` no longer exists. `sharp` and `pdfkit`
  stay outside the bundle because they load files from their own folders.
- Tested the way Vercel runs it, with `node --no-experimental-require-module`: the unbundled API
  fails with the same error, the bundle starts, lists products, converts an image and makes a PDF.

### Key ideas

- **Make the failure tell you its cause.** A crash before your code runs gives no detail.
  Moving the risky step inside a `try` turned a blind guess into a one line answer.
- **CommonJS and ES modules.** Older packages use `require`, newer ones `import`. A `require` of
  an ES module only works when Node's require(esm) support is on; a bundler removes the question
  by joining everything into one module.
- **Reproduce the platform locally.** Switching the same Node feature off on the laptop gave the
  exact Vercel error, so the fix could be proven before pushing.

### Questions a tutor might ask

1. **Why not just replace sanitize-html?** It protects the site from harmful HTML in product
   text. Swapping a security library to fix a packaging problem would trade a known, tested
   guard for an unknown one.
2. **Why are sharp and pdfkit not bundled?** sharp includes a compiled image library, and pdfkit
   reads font files next to its own code. Both must stay as normal files in `node_modules`.

### Still open

- Confirm `https://api.unityfj.com/health` after the deploy, then the storefront and admin.

## Two-factor sign in made optional (28 November 2026)

### What was built

- A setting, `ADMIN_MFA_REQUIRED`, in `apps/api/src/config/env.ts`. It is on unless set to
  `false`. The owner asked for password only sign in for now, so production sets it to `false`.
- With it off, `POST /v1/admin/auth/login` answers `{ next: 'done' }` and the admin page goes
  straight in. `requireAdmin` (`apps/api/src/middleware/adminAuth.ts`) stops asking for an
  `aal2` session.
- A test signs in with the password alone when the setting is off. The existing tests still
  prove the code is required when it is on.

### Key ideas

- **A switch, not a deletion.** The two-factor code stays, so turning it back on is one setting
  and a redeploy, with no code change.
- **Safe default.** If the setting is missing, two-factor is on. Forgetting a setting can only
  make the admin stricter, never weaker.

### Questions a tutor might ask

1. **What does aal2 mean?** Authenticator assurance level 2: Supabase marks a session aal2 once
   the person has also entered an authenticator code. With only a password it is aal1.
2. **What is the risk of password only?** Anyone who learns the password can open the admin, so
   the password must be long and unique. Two-factor should come back before more staff get
   accounts.

### Still open

- Turn two-factor back on later: set `ADMIN_MFA_REQUIRED=true` on the API in Vercel and redeploy.
  The owner's unfinished authenticator setup in Supabase can be removed under Authentication,
  Users, so the first sign in shows a fresh QR code.

## Update 02, part 1: in stock or arriving soon (28 November 2026)

### What was built

- A new column, `products.availability`, either `in_stock` or `arriving_soon`
  (`supabase/migrations/20261128000001_availability.sql`). Every product that existed when the
  migration ran became `arriving_soon`, so nothing turned buyable by accident. New products
  default to `in_stock`. The public view `public_products` gained the column.
- Storefront: a product in stock shows its exact count ("3 left", or "Out of stock" at 0). A
  product arriving soon shows "Arriving soon", no count, no Add to cart, and a "Request
  quotation" button that opens the quotation form on its page. Its structured data has no offer.
- API: the card and detail carry `availability`; the count of a product arriving soon is sent as 0. The cart refuses it with the problem `arriving_soon`, even if it has a price and stock.
- Order: the default Recommended order puts every product in stock before every product
  arriving soon. "In stock only" leaves arriving soon products out.
- Admin: an Availability dropdown on the product form, an Availability column and filter on the
  product list. The dashboard's low stock list ignores products arriving soon.
- Tests: the cart refusal, the hidden count and the order (integration), and a browser test.

### Key ideas

- **The server decides, not the button.** Hiding Add to cart is only for the customer's
  convenience. The rule lives in `priceLines` (`apps/api/src/services/pricing.ts`), so an old
  cart in a browser or a hand made request still cannot buy a product that has not arrived.
- **A safe migration default.** Existing rows got `arriving_soon` and the default was then
  changed to `in_stock`. One `alter table` with a default fills the existing rows, the second
  only affects rows added later.
- **Adding a column to a view.** Postgres only lets `create or replace view` add columns at the
  end, so `availability` was added last.

### Questions a tutor might ask

1. **Why send stock 0 instead of the real number for a product arriving soon?** The count of a
   product not on the shelf is not real yet. Sending 0 means no page can show it by mistake.
2. **Why not just use price 0 to mean "arriving soon", as before?** Price 0 means "price on
   request", which is a different thing. A product can have its price set before it arrives.

### Still open

- Apply the migration to the live database, then set up the 12 arrived products: sizes Single,
  Double and King at FJD 40, 50 and 60, with the counted stock for each size.

## Update 02, part 2: numbered bedsheets sort by number (29 November 2026)

### What was built

- The numbered bedsheets are set up in the admin, not by code: colours named "No. 1: White" to
  "No. 12: ...", one price for all. Only the order needed code.
- The product page lists variants by price, then by the number in a "No. N" colour or size name,
  then in the order they were added (`NUMBER_SORT` in `apps/api/src/services/catalogue.ts`). The
  admin's Sizes and colours list sorts the same way (`apps/api/src/routes/admin/resources.ts`).
- A test adds No. 10, No. 2 and No. 1 in that order and expects 1, 2, 10.

### Key ideas

- **Text sorts character by character.** "No. 10" comes before "No. 2" because "1" is less than
  "2". Reading the number out (`substring(name from '^No[.] *([0-9]+)')`) and sorting it as an
  integer gives 1, 2 ... 10.
- **No backslashes in the pattern.** `[.]` and `[0-9]` mean the same as `\.` and `\d`, but they
  survive JavaScript strings unchanged. A first try with backslashes lost them on the way to the
  database.

### Questions a tutor might ask

1. **Why not add a sort order column?** The numbers are already in the names the owner types. A
   separate column would be one more thing to keep in step.
2. **What happens to names without a number?** The number is null, nulls sort last, and those
   keep their old order (by name in the admin, by when they were added on the product page).

## Update 02, part 3: admin tabs and sub-tabs (29 November 2026)

### What was built

- The long admin sidebar became five main tabs: Dashboard, Sales, Products, Website and
  Settings. Each main tab's sub-tabs show as a row of links above the page.
- The menu is described once, in `apps/admin/src/nav.ts`. `Layout.tsx` draws it and works out
  the current tab from the address.
- New addresses that say where you are: `/sales/orders`, `/products/categories`,
  `/website/faqs`, `/settings/activity` and so on. Each plain list page in `resources.ts` now
  has its own `path`. The old addresses (`/orders`, `/r/faqs`, `/audit`, `/admins`,
  `/settings`) redirect to the new ones, so bookmarks keep working.
- Owner only sub-tabs (Shop details and bank, Document settings, Admin users) stay hidden from
  staff, as before. The API still refuses them on its side.
- On small screens the main tabs become a bar across the top and the sub-tabs scroll sideways.

### Key ideas

- **One description of the menu.** The tabs, their addresses and who may see them live in one
  list. The sidebar, the sub-tab row and the "which tab am I on" logic all read it, so they
  cannot disagree.
- **Real links with aria-current.** Screen readers announce the current tab, and every tab
  works with the keyboard and can be opened in a new browser tab.
- **Longest match wins.** `/products/categories/4` matches both All products (`/products`) and
  Categories; the longer prefix, Categories, is the current one.

### Questions a tutor might ask

1. **Why redirect the old addresses instead of just changing them?** Staff may have bookmarks,
   and the browser history holds old links. A redirect costs one line each.
2. **Is hiding a tab enough to protect owner pages?** No. Hiding is for tidiness; the API checks
   the owner role on every request.

## Update 02, part 4: documents (invoices, receipts, proformas, order forms) (29 November 2026)

### What was built

- **Sales > Documents** in the admin. Pick a type (invoice, official receipt, proforma invoice,
  order form), pick a saved party or type a new one, enter the lines and the type's own fields,
  and press Issue. That one button saves the document and its PDF, emails the PDF to the party
  (shop email as reply to) and downloads it in the browser. A Preview button draws the PDF
  first, marked PREVIEW, without saving anything.
- **Numbers** INV-0001, RCT-0001, PRO-0001 and ORD-0001, one sequence per type, in
  `document_counters`. The owner can set the next number in **Settings > Document settings**
  so the website continues after the paper books.
- **Parties**: saved customers, with each party's documents. A document keeps a copy of the
  party's details as they were when it was issued.
- **Void, never edit**: an issued document cannot be changed or deleted. A mistake is fixed by
  voiding it with a reason and issuing a new one. The PDF is redrawn with a large VOID mark.
- **Receipt from invoice**: "Make receipt" fills in the party, the amount and "Invoice
  INV-0001", and marks the invoice paid when the receipt is issued (voiding the receipt undoes
  that).
- **PDFs** are drawn with pdfkit (`apps/api/src/lib/documentPdf.ts`) in the design of the paper
  forms (`docs/forms/make_forms.py`): logo, title with the orange underline, party and number
  boxes, striped item table, totals with the blue total row, payment details, numbered terms,
  signature lines and the three colour strip. The website's order invoices now use the same
  design (`apps/api/src/lib/invoice.ts`).
- **Settings**: legal name, TIN, SWIFT code and M-PAiSA number were added to Shop details and
  bank. VAT rate, "prices include VAT" and the terms and conditions are in Document settings.
- Database: `supabase/migrations/20261129000001_documents.sql`. PDFs go to a private bucket,
  `documents`.
- Tests: totals, VAT, rounding, numbers and amounts in words (unit); issuing, six documents at
  once getting six different numbers, a failed email, void, receipts, the database refusing
  changes, permissions and settings (integration); the whole flow in the browser (e2e).

### Key ideas

- **Accounting records are append only.** Invoices and receipts are evidence of what was
  charged and paid. Editing one later would make the books disagree with the paper the
  customer holds. So the database itself refuses updates and deletes (triggers in the
  migration), and the only change allowed is voiding.
- **Taking a number safely.** `update document_counters set next_number = next_number + 1
returning next_number - 1` runs inside the transaction that saves the document. The update
  locks the counter row, so a second admin waits for the first to finish. If saving fails, the
  whole transaction rolls back and the number is not used up.
- **Save first, email second.** The email happens after the transaction commits. If Resend
  is down, the document is still saved and downloaded, and the list shows "Not emailed" with a
  Resend email button.
- **VAT without floating point.** "Prices include VAT" takes VAT out of the total:
  VAT = total x rate / (100 + rate), worked in whole cents with BigInt and rounded half up.
  Subtotal is then total minus VAT, so the three lines always add up exactly.
- **Snapshots.** A document stores copies of the party, the business details and the terms as
  they were when issued, so a VOID copy redrawn a year later looks exactly like the original.

### Questions a tutor might ask

1. **Why not use a Postgres sequence for the numbers?** A sequence never goes backwards, so a
   failed save would leave a gap (INV-0004 missing). Auditors ask about gaps. A counter row
   updated inside the transaction gives the number back when the save fails, and the owner can
   set where it starts.
2. **Why keep the PDF instead of drawing it again on every download?** The stored PDF is
   exactly what the customer received. Drawing it again with newer code or settings could
   produce a slightly different document.

### Still open

- The owner should check, in Settings: the address printed on documents (the paper forms say
  "Lot 23, 9 Miles, Nakasi, Suva, Fiji", the settings say "Lot 23, Nakasi, Fiji"), the legal
  name, TIN, bank details, SWIFT and the M-PAiSA number.
- Starting numbers for INV, RCT, PRO and ORD (Settings > Document settings). They start at 1.
- VAT on documents: on at 12.5%, prices including VAT, as on the paper forms. Confirm.
- Website orders keep their own order numbers on their invoices; they do not take INV numbers.
