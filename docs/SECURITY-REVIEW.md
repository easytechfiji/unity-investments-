# Security review

Date: 13 October 2026. Reviewer: Claude Code, for Sultan to check.
Scope: everything in this repository, run locally. Nothing has been deployed yet, so items about hosting, Cloudflare and live keys are marked as not done.

Each item from CLAUDE.md Appendix B is listed with its status and the evidence. Status is one of:
**Done** (built and tested), **Partly** (built, something still missing), **Not done**, **Launch task** (can only be done on the real hosting, listed in docs/CUTOVER.md).

Test files referred to:

- `apps/api/test/integration/checkout.test.ts`, `paypal.test.ts`, `admin.test.ts`, `public.test.ts` (run against real Postgres)
- `supabase/tests/rls.test.ts` (database rules, in-process Postgres)
- `apps/web/e2e/*.spec.ts` (browser tests)

## Lessons from the old site

| Old problem                                   | Status | Evidence                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cart trusted the price from the browser       | Done   | The cart schema has no price field and rejects unknown fields (`packages/shared/src/schemas.ts`). Tests: "refuses a price sent from the browser", "refuses a total, discount or delivery cost", browser test "a price tampered with in the browser has no effect".                                                                                                 |
| `APP_DEBUG=true` showed raw errors            | Done   | One error handler returns a generic message and a request id (`apps/api/src/middleware/errorHandler.ts`). Test: "hides the details of unexpected errors".                                                                                                                                                                                                          |
| `/optimize`, `/clear` ran server commands     | Done   | No such routes exist. Test: unknown routes return JSON 404.                                                                                                                                                                                                                                                                                                        |
| Deletes were plain GET links                  | Done   | Deletes are DELETE requests that need an `X-Confirm-Delete` header sent only after an on-screen confirm, and are soft for products, categories and orders. Tests: "needs a confirm step to delete" (428 without it), restore tests.                                                                                                                                |
| Order emails copied to outside addresses      | Done   | Emails go to the customer and the shop inbox from settings only (`apps/api/src/services/notifications.ts`). Test: recipients are exactly the customer and the shop.                                                                                                                                                                                                |
| Guessable `ODOS` + 4 digit order number       | Done   | Sequential `OD-100001` numbers for people, plus a 128 bit random reference for lookups. Tests in `rls.test.ts` and the lookup tests.                                                                                                                                                                                                                               |
| Stock taken before payment, could go negative | Done   | Bank transfer orders take stock when placed; PayPal orders only just before capture; every update is `stock = stock - n where stock >= n`; a check constraint forbids negative stock. Tests: "sells the last item to only one of two buyers", "takes no money when the stock sold out between ordering and paying" (proved by removing the guard: the test fails). |
| Live keys in a `.env` in a zip                | Partly | Secrets are only in gitignored `.env` files and the host's secret store; gitleaks runs on every commit and in CI. **Rotating the old PayPal keys and database password is still to do (Sultan).** The old keys were removed from `legacy/` and are in the Recycle Bin until it is emptied.                                                                         |
| 60 MB log of errors in the web folder         | Done   | Logs are JSON lines on stdout for the host's log service; no log files in public folders; no personal data in them.                                                                                                                                                                                                                                                |
| Crash on a blank form field                   | Done   | zod validation on every input. Test: "rejects a blank body instead of crashing".                                                                                                                                                                                                                                                                                   |

## 1. Money and orders

| Item                                                             | Status | Evidence                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 Server recomputes every total                                | Done   | `apps/api/src/services/pricing.ts`. Database check `total = subtotal + shipping_cost + tax_total`.                                                                                                                                                            |
| 1.2 Client never sends a price that is believed                  | Done   | `expectedTotal` is only compared; a mismatch stops the order (409) and is never charged. Test: "charges the database price even when the expected total is lower".                                                                                            |
| 1.3 Atomic stock change                                          | Done   | See above. Row locks during pricing plus the guarded update.                                                                                                                                                                                                  |
| 1.4 PayPal: server creates, captures, checks amount and currency | Done   | `apps/api/src/services/orders.ts` `capturePaypal`. Test: "never marks paid when the captured amount does not match".                                                                                                                                          |
| 1.5 Webhook signature and idempotency                            | Done   | Signature checked with PayPal's verify API; event ids stored in `payment_events`; paid is set with `where payment_state <> 'paid'`. Tests: replayed webhook handled once, forged signature rejected. **Needs `PAYPAL_WEBHOOK_ID` from the PayPal dashboard.** |
| 1.6 Only an admin marks bank transfers paid                      | Done   | `POST /v1/admin/orders/:id/mark-paid`, admin session required.                                                                                                                                                                                                |
| 1.7 No card numbers on our servers                               | Done   | PayPal's own buttons and pages.                                                                                                                                                                                                                               |

## 2. Database and Supabase

| Item                                                | Status      | Evidence                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.1 RLS on every table, no access by default        | Done        | `supabase/migrations/20261013000006_lock_down.sql`. Test: "is switched on for every table" (fails if a new table forgets it).                                                                                                                                                                                                                                                        |
| 2.2 Anon reads only safe public views               | Done        | Tests: anon and authenticated cannot read or write any table; can read every `public_*` view; bank details never in public settings. Public API endpoints also run as `anon` (`db.asAnon`).                                                                                                                                                                                          |
| 2.3 service_role / secret key only on the API       | Done        | Only `apps/api` reads `SUPABASE_SECRET_KEY`; the storefront and admin never receive it.                                                                                                                                                                                                                                                                                              |
| 2.4 Parameterised queries                           | Done        | All queries use `$1` parameters; column names come only from trusted definitions in code. Search escapes `%` and `_`. Test: "treats % as a character".                                                                                                                                                                                                                               |
| 2.5 Customer data only for admin or the order owner | Done        | Order lookup needs the 128 bit reference and the email. Test: "does not show one customer's order to someone else".                                                                                                                                                                                                                                                                  |
| 2.6 Backups and a restore test                      | Partly      | `scripts/db/backup.mjs` makes a separate export (shop data plus admin accounts) and restores it into a scratch database, comparing every table. **Restore test run locally on 13 October 2026: all 20 tables matched; RLS, public view access and the audit log protection survived the restore.** Turning on Supabase backups and a weekly export from production are launch tasks. |
| 2.7 Limited roles, no open database port            | Launch task | Supabase manages this; use the pooler connection string and keep "Network restrictions" on in Supabase.                                                                                                                                                                                                                                                                              |

## 3. Authentication and sessions

| Item                                                                           | Status | Evidence                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.1 Supabase Auth, password plus required TOTP, no sign up, no default account | Done   | `apps/api/src/routes/admin/auth.ts`; accounts only via `npm run admin:create`. Tests: password alone gives `mfa_required`; a password alone cannot add a new authenticator; first sign in sets one up. **Tested against a local stand-in for Supabase Auth; repeat once against the real Supabase project.** |
| 3.2 Admin role stored server side                                              | Done   | `admin_profiles` table; a signed in user without a row is refused. Test: "refuses a signed in user who is not an admin"; staff cannot open settings.                                                                                                                                                         |
| 3.3 Short sessions, HttpOnly, Secure, SameSite cookies                         | Done   | Access token about 1 hour, refresh cookie 8 hours, `HttpOnly; SameSite=Strict`, `Secure` required in production by the config check. Test checks the cookie flags.                                                                                                                                           |
| 3.4 Login rate limits and back off, alert on repeated failures                 | Partly | Per IP limit and per account exponential back off. Test: "slows down repeated wrong passwords". **Alerts are not set up**: failed sign ins are logged as warnings; an alert needs the log service chosen at launch.                                                                                          |
| 3.5 Own subdomain, noindex, IP rule or Cloudflare Access                       | Partly | Separate app, `noindex` meta and `X-Robots-Tag` from the API. **Cloudflare Access in front of the admin is recommended and is a launch task.**                                                                                                                                                               |
| 3.6 Audit log admins cannot edit                                               | Done   | Insert only by grants and a trigger. Tests: the API role cannot update or delete; even the owner role is blocked.                                                                                                                                                                                            |

## 4. API hardening

| Item                                                              | Status | Evidence                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 helmet and strict CORS                                        | Done   | `apps/api/src/app.ts`. Tests for headers and CORS.                                                                                                                                                                                          |
| 4.2 zod on everything, unknown fields rejected, small body limits | Done   | 20 KB public, 300 KB admin. Tests for unknown fields, malformed JSON, oversized bodies.                                                                                                                                                     |
| 4.3 Rate limits per route group                                   | Done   | Forms 5 per 10 minutes, checkout 20, lookup 10, login 10 per 15 minutes, general 300 per minute. Test: "stops a sixth contact message". Limits are in memory per process; with more than one API process, use Cloudflare rate limiting too. |
| 4.4 No stack traces or database text                              | Done   | Database rule errors become plain messages. Test with a database message containing an email.                                                                                                                                               |
| 4.5 Authorisation on every admin route                            | Done   | One `requireAdmin` before every admin router. Tests: seven admin routes refused without login; forged token refused.                                                                                                                        |
| 4.6 Request ids                                                   | Done   | Every response has `X-Request-Id`; the client cannot set it.                                                                                                                                                                                |
| 4.7 Few, current dependencies; lockfile; audit; Dependabot        | Done   | Lockfile committed; `npm audit` in CI (production dependencies block on high); Dependabot weekly. Production audit: 0 vulnerabilities on 13 October 2026. One dev-only advisory (braces, via the Next.js ESLint plugin) has no fix yet.     |

## 5. Browser protection

| Item                                          | Status | Evidence                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 CSP with nonces                           | Done   | `apps/web/src/proxy.ts`: fresh nonce per request, `strict-dynamic`, only PayPal and Turnstile allowed besides our own origins. Browser test checks the nonce changes per request; zero CSP errors in the console on six key pages. The brief suggests starting in report-only mode: set `CSP_REPORT_ONLY=true` on staging for the first days if anything is blocked. |
| 5.2 Security headers                          | Done   | HSTS, nosniff, Referrer-Policy, Permissions-Policy, `frame-ancestors 'none'` and X-Frame-Options. **HSTS preload is a launch task** once HTTPS is confirmed on every subdomain.                                                                                                                                                                                      |
| 5.3 No raw HTML except sanitised descriptions | Done   | Admin HTML is cleaned with an allow list on save, in the API and again in the storefront (`packages/shared/src/sanitize.ts`). Tests: scripts, event handlers, iframes and `javascript:` links are removed. JSON-LD uses escaped JSON (not HTML).                                                                                                                     |
| 5.4 CSRF                                      | Done   | `SameSite=Strict` cookies plus an Origin check on every admin change. Test: "refuses changes from another website".                                                                                                                                                                                                                                                  |
| 5.5 Self hosted fonts and scripts             | Done   | Fonts are local WOFF2 files; only PayPal and Turnstile scripts come from outside, and only on the pages that need them.                                                                                                                                                                                                                                              |

## 6. Uploads

| Item                                                              | Status | Evidence                                                                                                            |
| ----------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| 6.1 Admins only                                                   | Done   | Upload routes sit behind `requireAdmin`.                                                                            |
| 6.2 Real file type from the first bytes, JPG/PNG/WebP, size limit | Done   | `apps/api/src/lib/media.ts`, 8 MB. Test: a PHP file named `.png` is refused (415).                                  |
| 6.3 Re-encode with sharp                                          | Done   | Every upload is redrawn as WebP at 400, 800 and 1600 pixels; metadata dropped. Test checks the stored file is WebP. |
| 6.4 Random names, no user chosen paths                            | Done   | Keys are `folder/year/<32 random hex>`; keys are checked against a pattern before use.                              |

## 7. Public forms

| Item                                              | Status | Evidence                                                                                                                                                                      |
| ------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1 Validation, honeypot, Turnstile, per IP limit | Done   | Tests for honeypot and limits. **Turnstile keys are needed for production; without them the check is skipped outside production and the API refuses to start in production.** |
| 7.2 No header injection                           | Done   | Single line fields reject control characters; header values are cleaned again in the mailer. Test: line breaks in name or subject refused.                                    |
| 7.3 Plain text emails of user text                | Done   | Test: the enquiry email has no HTML part and the visitor's `<b>` stays as text.                                                                                               |

## 8. Personal data

| Item                                                  | Status | Evidence                                                                                                                                                                                                                                       |
| ----------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1 Collect only what an order needs                  | Done   | Name, email, phone, address for delivery only.                                                                                                                                                                                                 |
| 8.2 Never logged; privacy page                        | Partly | Not logged (only method, path, status, request id). Privacy page exists with plain default text. **No automatic deletion of old guest orders yet**: decide a retention period with the owner (orders are business records, so likely 7 years). |
| 8.3 Lookup by long reference plus email, rate limited | Done   | See 2.5.                                                                                                                                                                                                                                       |

## 9. Edge, hosting and operations

| Item                                        | Status      | Evidence                                                                                                                                             |
| ------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9.1 Cloudflare in front, DNS records copied | Launch task | docs/CUTOVER.md.                                                                                                                                     |
| 9.2 HTTPS everywhere, one host              | Partly      | `www` to the main host with a 301 in `proxy.ts`; `upgrade-insecure-requests` when the site is HTTPS. HTTP to HTTPS is set at the host or Cloudflare. |
| 9.3 security.txt                            | Done        | `apps/web/public/.well-known/security.txt`. Update the contact address and expiry before launch.                                                     |
| 9.4 Monitoring                              | Not done    | `/health` on the API checks the database. Uptime checks, error tracking and alerts are launch tasks.                                                 |
| 9.5 Separate staging and production         | Launch task | Same code, separate Supabase projects and keys; the storefront refuses indexing unless `ALLOW_INDEXING=true`.                                        |
| 9.6 Secret scanning from the first commit   | Done        | `.githooks/pre-commit` and CI.                                                                                                                       |

## 10. Before launch

| Item                                                     | Status                                                                                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 10.1 OWASP ZAP baseline on staging, fix medium and above | See "ZAP baseline scan" below (run locally; repeat on staging).                                                                        |
| 10.2 Cheat tests                                         | Done: price change, negative quantity, over-stock, replayed webhook, admin route without login, another customer's order. All refused. |
| 10.3 This document                                       | Done, to be updated after staging.                                                                                                     |
| 10.4 Rotate old PayPal keys and database password        | Not done (Sultan).                                                                                                                     |

## ZAP baseline scan

Run on 13 October 2026 with OWASP ZAP 2.17.0 against the production builds on this computer (storefront on port 3000, API on port 4000). Baseline means a spider plus the passive scanner: ZAP looks at every response but sends no attacks. Plan: `.data/zap/baseline.yaml` (copy in this section below). Repeat on staging before launch, as Appendix B 10.1 asks.

**Result: no High, Medium or Low risk findings.** Three informational notes:

| Note                             | Count | What it is                                                                                                                                                                                                                                                                | Action                                                                                                                               |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Sensitive information in URL     | 5     | The spider submitted the quote form without running JavaScript. The form had no `method`, so a browser falls back to GET and the name, email and phone appear in the address, browser history and server logs. Only happens if JavaScript fails, but it is personal data. | **Fixed**: every form that collects details now has `method="post"` (EnquiryForm, CheckoutForm, OrderLookup, the add to cart forms). |
| User controllable HTML attribute | 81    | Filter values from the address (`min`, `max`) are shown back in the filter boxes. React escapes them and the values must match a money pattern, so they cannot carry markup.                                                                                              | None needed.                                                                                                                         |
| Suspicious comments              | 85    | Words such as "query" inside the Next.js JavaScript bundles. Framework code, no secrets.                                                                                                                                                                                  | None needed.                                                                                                                         |

Not covered by this scan: the admin app, because its security headers are set by the host (`apps/admin/vercel.json`) and only exist once deployed. Scan the admin on staging too, after signing in, with an authenticated ZAP context.

Plan used:

```yaml
env:
  contexts:
    - name: shop
      urls: [http://localhost:3000, http://localhost:4000]
      includePaths: ['http://localhost:3000.*', 'http://localhost:4000.*']
jobs:
  - type: requestor # API and shop flow pages the spider cannot find by links
  - type: spider
    parameters: { context: shop, url: http://localhost:3000, maxDuration: 3 }
  - type: passiveScan-wait
  - type: report # traditional-json and traditional-md
```

Run with: `java -Xmx768m -jar zap-2.17.0.jar -cmd -dir <folder> -autorun baseline.yaml`.
