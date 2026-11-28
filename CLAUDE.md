# Unity Investment: online shop (brief)

Read this file first. It is the standing context and rules for this repository.

## What this project is

The online shop for Unity Investment (Unity Investments & Marketing (Fiji) Pte Ltd), a business at Lot 23, Nakasi, Fiji. Domain: unityfj.com.

It sells one category, Blankets & Bedding: double bed bedsheets and bedding sets (subcategories
`double-bed-bedsheets`, `bedding-sets` and `new-arrivals`, which was `coming-soon` until the 12 arrived products came in). Customers browse, add to cart and check out as guests,
then pay by bank transfer or PayPal, and collect from the shop or ask for delivery.

The developer is Sultan (Easytech), who works in VS Code on Windows.

History:

- The previous Unity Investment website was "VAULT", a read-only product catalogue (React and
  Express, products edited in the Supabase dashboard). It lives in the git history of this
  repository on `main`, before the `ecommerce-conversion` branch. Its logo, category pictures and
  product photos are reused here.
- The shop code itself was copied from another working shop Sultan built (an office supplies
  store). Only the keys, the database and the branding were changed. See `ECOMMERCE-SETUP.md`
  for the steps that were followed.

## Business facts

| Item              | Value                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| Name on the site  | Unity Investment                                                            |
| Legal name        | Unity Investments & Marketing (Fiji) Pte Ltd                                |
| Address           | Lot 23, Nakasi, Fiji                                                        |
| Phone, WhatsApp   | +679 992 4441                                                               |
| Shop email        | unityfiji.info@gmail.com                                                    |
| Site email sender | orders@unityfj.com, through Resend (the domain must be verified in Resend)  |
| Currency          | Prices in FJD. PayPal cannot charge FJD, so it charges `PAYPAL_CURRENCY`.   |

Contact details live in the database (`site_settings`) and are edited in admin Settings. The
first migration only gives a new database a starting copy. Never write business facts into page
code: read them from `site` (the settings) instead.

Never invent business facts or customer facing wording (delivery times, prices, FAQs, opening
hours, testimonials). Ask Sultan. Where real content is missing, leave the section out.

## How to work with Sultan (teaching mode)

Sultan is a software engineering student and must be able to explain every part of this project
to a tutor. So:

1. Before writing code for a new concept, explain it in two or three plain sentences: what it is
   and why it is needed.
2. Keep steps small. Finish one thing, show it working, then move on.
3. After a meaningful piece of work, add an entry to `docs/LEARNING-LOG.md`: what was built, the
   key ideas, why it was done this way, two questions a tutor might ask with short answers, and
   what is still open.
4. Say what you are unsure about. Do not guess silently.
5. Ask before installing anything big or changing the stack.
6. Report the real results of checks, including failures.
7. Commit or push only when Sultan asks. Do not touch GitHub otherwise.

## Stack

| Folder                | What                                                  | Stack                        |
| --------------------- | ----------------------------------------------------- | ---------------------------- |
| `apps/web`            | Storefront, server rendered for SEO                   | Next.js 16, React 19         |
| `apps/admin`          | Admin panel, on its own subdomain                     | React 19, Vite, React Router |
| `apps/api`            | API: catalogue, cart, checkout, PayPal, emails, admin | Node 22, Express 5           |
| `packages/shared`     | Schemas, money and types used by all three            | zod                          |
| `supabase/migrations` | Database, with Row Level Security                     | Postgres 17 (Supabase)       |
| `scripts`             | Local database, backups, brand assets, checks         | Node                         |

npm workspaces, TypeScript strict mode. Next.js 16 differs from older versions: read the guide in
`node_modules/next/dist/docs/` before changing storefront framework code.

Architecture:

- The storefront reads the catalogue through the API. It never talks to Supabase directly.
- The API runs public reads as the `anon` role, so Row Level Security protects the data even if
  an API query is wrong. Admin writes need a signed in admin.
- Admin sign in goes through the API to Supabase Auth with two-factor (TOTP). Two-factor is
  switched off in production for now (`ADMIN_MFA_REQUIRED=false`, at the owner's request); it is
  on by default and comes back by setting it to `true`. The session is kept in HttpOnly SameSite=Strict cookies. Locally and in tests a stand-in for Supabase Auth
  (`apps/api/dev/fakeAuth.ts`) is used; it never runs in production.
- Images and videos go to Supabase Storage in production (`STORAGE_DRIVER=supabase`), and to
  `.data/` locally.
- Emails go through Resend in production and to `.data/outbox` locally.
- Documents (invoices, official receipts, proforma invoices, order forms) are issued in the admin,
  Sales > Documents. The API saves the record and the PDF (private `documents` bucket, `.data/documents`
  locally), emails it and the browser downloads it. Issued documents cannot be changed or deleted,
  only voided (database triggers enforce it). PDFs are drawn with pdfkit in
  `apps/api/src/lib/documentPdf.ts`; website order invoices use the same design.
- In production all three run on Vercel. The API is a Vercel function (`apps/api/api/index.js`)
  that builds the Express app with `src/bootstrap.ts`; locally it runs as a normal Node server.
  Vercel limits requests to 4.5 MB, so large uploads (most videos) cannot go through the admin.

Settings come only from environment files, checked at startup in `apps/api/src/config/env.ts`
(API) and read in `apps/web/src/lib/config.ts` (storefront). Every variable is listed in the
`.env.example` next to each `.env`.

## Brand

- Logo: `here/unity-logo.png`. `npm run brand:assets` builds the header logo, favicons and share
  image from it. The square files use the round emblem only.
- Colours (`apps/web/src/styles/globals.css`): the logo blue and orange are too light for text on
  white, so the site uses darker shades of them. Blue `#13649a` (`--navy`) for headings, links and
  the header band; orange `#b35c00` (`--red`) only for main buttons, sale prices and focus rings.
  The token names were kept from the original code.
- Category cover pictures: `apps/web/public/images/categories/`, mapped by category slug in
  `apps/web/src/lib/categoryImages.ts`. Only `blankets-bedding` is used. It matches the old
  site: `/category/blankets-bedding` redirects to `/collection/blankets-bedding`, and the old
  site's other categories redirect to `/collection`.

## Rules that apply to everything

1. Prices, totals, stock and delivery are always calculated on the server from the database,
   never from anything the browser sends.
2. All user text, code comments, commit messages and docs: no em dashes, no en dashes, no emojis,
   no marketing filler. Plain sentences, Fiji and New Zealand English spelling.
   `npm run check:text` enforces the dashes and emojis.
3. Never commit secrets. Only `.env.example` files with empty values go in git. Never paste a key,
   password or bank detail into chat, code, docs or logs.
4. Do not log personal data (names, addresses, phone numbers, emails).
5. Every public page is server rendered with its own title, description, canonical and
   structured data (`apps/web/src/lib/seo.ts`).
6. WCAG 2.2 AA: text contrast, visible focus, labels on every field, works by keyboard and at
   360 px wide.
7. Look: plain and practical. No gradients, glass effects, icon libraries, fake reviews, fake
   urgency or stock photos of people. Use the business's real photos.
8. Work is done only when `npm run typecheck`, `npm run lint`, `npm test` and, for pages,
   `npm run test:e2e` pass.

## Data

- The sample catalogue (`supabase/seed/sample-data.sql`, every SKU starts with `SAMPLE-`) is for
  development and staging only. Remove it with `npm run db:remove-samples`. Never load it into
  production.
- `supabase/seed/test-fixtures.sql` holds made up data for automated tests only.
- The 47 bedding products from the old VAULT catalogue are copied in with `npm run import:vault`
  (`apps/api/scripts/import-vault.ts`). The VAULT project has been deleted, so it now only works
  with `--from <backup folder>`; that backup was also deleted once the products were in the new
  database (21 November 2026). It re-encodes each photo with the shop's image code, and is safe to run twice. VAULT had no prices, so they
  start at 0 ("Request a quote"); the owner enters prices and stock in the admin.

## Open decisions

| Question            | For now                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| PayPal currency     | Not set. PayPal stays hidden until `PAYPAL_CURRENCY` and the rate are set. |
| VAT                 | Off (`TAX_ENABLED=false`).                                                 |
| Delivery prices     | None yet. Click And Collect, or ask for a delivery quote by phone.         |
| Opening hours, FAQs | Not shown until Sultan supplies them.                                      |

## Going live

`docs/DEPLOYMENT.md` (Supabase, then Vercel for the API, storefront and admin), then `docs/CUTOVER.md` (moving unityfj.com
from the old site without breaking email). `docs/SECURITY-REVIEW.md` lists the security work.
