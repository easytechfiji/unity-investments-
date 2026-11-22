# Deployment

How to put the shop on staging and then production. Staging and production are two copies of everything below, with separate Supabase projects and separate keys (Appendix B 9.5). Do staging first and run it for at least a week (docs/CUTOVER.md).

Planned addresses (change them here and in the settings if different):

| Part                     | Address                                   | Host                                    |
| ------------------------ | ----------------------------------------- | --------------------------------------- |
| Storefront               | https://unityfj.com (www redirects to it) | Vercel, project root `apps/web`         |
| Admin                    | https://admin.unityfj.com                 | Vercel, project root `apps/admin`       |
| API                      | https://api.unityfj.com                   | A small Node 22 host of Sultan's choice |
| Database, logins, images | Supabase project                          | Supabase                                |

Staging uses the same pattern under a staging name, for example `staging.unityfj.com`, and is behind a login (Vercel deployment protection or Cloudflare Access).

## 1. Supabase

1. Create the project in the region closest to Fiji (Sydney). Choose a strong database password and keep it in a password manager.
2. Project Settings, Data API: note the Project URL. API Keys: note the publishable key and the secret key.
3. Connect, Session pooler: copy the connection string, put the password in, and save it as `SUPABASE_DB_URL` in the root `.env` on your computer only.
4. Push the database: `npm run db:push`. It applies every file in `supabase/migrations` and records them where the Supabase CLI expects.
5. Storage: create a bucket named `media`, public, and limit file types to `image/webp`. Only the API writes to it. Create a second bucket named `videos`, public, limited to `video/mp4`, for promotional product videos.
6. Authentication: turn off "Allow new users to sign up". Turn on multi-factor (TOTP). Set the Site URL to the admin address.
7. Database, Backups: check daily backups are on (point in time recovery if the plan allows).
8. Database, Network restrictions: allow only what needs it.
9. Create the owner's admin account with `npm run admin:create -- --email <owner email> --name "<owner name>" --role owner`, using the API settings for this project (see section 3). The person sets up their authenticator app on first sign in.
10. Staging only: `node scripts/db/samples.mjs load --url "$SUPABASE_DB_URL" --i-understand-this-is-not-production` if you want the sample catalogue there. Never on production.

## 2. API host

Any host that runs Node 22 works (for example Render, Railway or Fly.io). Commands:

- Build: `npm ci && npm run build:shared && npm run build -w @od/api`
- Start: `npm run start -w @od/api`
- Health check path: `/health` (checks the database too)
- One process is enough for this shop. If you run more than one, rate limits are per process; add Cloudflare rate limiting rules.

Settings (in the host's secret store, never in git). See `apps/api/.env.example` for the full list:

| Setting                                                                                          | Production value                                                                                   |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                       | `production`                                                                                       |
| `CORS_ORIGINS`                                                                                   | `https://unityfj.com,https://admin.unityfj.com`                                                    |
| `ADMIN_ORIGIN`                                                                                   | `https://admin.unityfj.com`                                                                        |
| `SITE_URL`                                                                                       | `https://unityfj.com`                                                                              |
| `API_PUBLIC_URL`                                                                                 | `https://api.unityfj.com`                                                                          |
| `TRUST_PROXY`                                                                                    | `2` behind Cloudflare and the host's load balancer (check the host's documentation)                |
| `COOKIE_SECURE`                                                                                  | `true`                                                                                             |
| `DATABASE_URL`                                                                                   | Supabase session pooler string                                                                     |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`                                | From Supabase                                                                                      |
| `STORAGE_DRIVER`                                                                                 | `supabase`                                                                                         |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`                                                 | `resend`, the key, `Unity Investment <orders@unityfj.com>` (verify the domain in Resend first)     |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`                                                     | From Cloudflare Turnstile                                                                          |
| `PAYPAL_ENV`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_CURRENCY` | `sandbox` on staging, `live` on production. Leave the client id empty to offer bank transfer only. |
| `SHOP_CURRENCY`, `TAX_ENABLED`, `TAX_RATE`                                                       | `FJD`, `false`, `0` until VAT is decided                                                           |

The API refuses to start in production if a required setting is missing, and says which one.

PayPal: in the PayPal developer dashboard create the app, then add a webhook to `https://api.unityfj.com/v1/paypal/webhook` for `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED` and `PAYMENT.CAPTURE.REFUNDED`. Its id is `PAYPAL_WEBHOOK_ID`. Then set the exchange rate in the admin Settings page; PayPal stays hidden until the rate is set.

## 3. Creating admin accounts against Supabase

Put the production (or staging) values in `apps/api/.env` on your own computer for the moment you run the command, and remove `AUTH_URL` from it:

```
npm run admin:create -- --email owner@example.com --name "Owner name" --role owner
```

It prints a password once. Give it to the person in person or by phone, not by email. Afterwards put your local `.env` back to the development values.

## Vercel: two projects, not one multi-service project

Vercel may offer to "import a multi-service project" and suggest a root `vercel.json` that serves the admin at `/admin` and the API at `/api` on one domain. Do not use it. The admin must stay on its own subdomain (a storefront bug cannot then reach the admin session), the API routes start with `/v1`, and the API keeps its rate limits in memory, so it must run as one long lived Node process, not as serverless functions. Import the repository twice instead, once per root folder below. There is no root `vercel.json` on purpose.

## 4. Storefront (Vercel, root `apps/web`)

- Framework: Next.js. `apps/web/vercel.json` sets the install command (`npm ci` at the repository root) and the build command (`npm run build:shared && npm run build -w @od/web`), so leave those fields empty in the Vercel dashboard. Node version 22.
- Settings: `SITE_URL`, `API_URL` and `NEXT_PUBLIC_API_URL` (both the API address), `MEDIA_ORIGIN` (the Supabase project URL), `ALLOW_INDEXING=true` on production only.
- Add both `unityfj.com` and `www.unityfj.com`; the storefront sends www to the main address with a 301.

## 5. Admin (Vercel, root `apps/admin`)

- `apps/admin/vercel.json` sets the install command, the build (`npm run build:shared && npm run build -w @od/admin`) and the output folder `dist`. Node version 22.
- Setting: `VITE_API_URL=https://api.unityfj.com`.
- `apps/admin/vercel.json` sets the security headers. If the API or Supabase address differs from the plan, update its Content Security Policy.
- Put Cloudflare Access (free for small teams) in front of the admin address so only listed email addresses can even load it.

## 6. Cloudflare

See docs/CUTOVER.md: copy every DNS record first, especially MX, SPF and DKIM for the shop's email.

## 7. After each deploy

- `curl https://api.unityfj.com/health` returns `{"status":"ok"}`.
- Open the storefront, add something to the cart, check the totals.
- Sign in to the admin.
