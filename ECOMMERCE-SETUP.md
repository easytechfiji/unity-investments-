# Convert this codebase into the new e-commerce site

This folder is a copy of a working e-commerce site (Online Distributors & Office Supplies). Reuse all of the code as it is. Only change the API keys, the database, and the branding for the new business.

Ask me for the new business name, domain and logo before starting step 3.

## 0. Get the source code

The code is NOT in this folder yet. Copy it in from here:

- Zip: `C:\Users\danif\Documents\GitHub\onlinedistributorsfiji.zip` (about 800 MB, mostly `node_modules`)
- The same project, already unzipped: `C:\Users\danif\Documents\GitHub\onlinedistributorsfiji`

Do not edit or delete anything in either of those. They are the original shop and must keep working. Copy into the current project folder instead.

Copy from the unzipped folder and skip what will be deleted anyway (PowerShell, run from this project's root):

```powershell
robocopy "C:\Users\danif\Documents\GitHub\onlinedistributorsfiji" . /E /XD node_modules .git .data .next dist test-results legacy /XF .env .env.local
```

If the unzipped folder is missing, extract the zip to a temporary folder first with `Expand-Archive`, then run the same `robocopy` from there. robocopy exit codes 0 to 7 mean success.

Skipping `.env` and `.env.local` means the old shop's real keys never reach this folder. Create the empty env files in step 2 from the `.env.example` files.

## What the code is

An npm workspaces monorepo. Read `README.md` first. `CLAUDE.md` is the old shop's brief.

| Folder                | What                                                  | Stack                        |
| --------------------- | ----------------------------------------------------- | ---------------------------- |
| `apps/web`            | Storefront                                            | Next.js 16, React 19         |
| `apps/admin`          | Admin panel                                           | React 19, Vite, React Router |
| `apps/api`            | API: catalogue, cart, checkout, PayPal, emails, admin | Node 22, Express 5           |
| `packages/shared`     | Shared schemas, money and types                       | zod                          |
| `supabase/migrations` | Database with Row Level Security                      | Postgres 17 (Supabase)       |

All settings are read from environment files. The API checks them at startup in `apps/api/src/config/env.ts`. The storefront reads them in `apps/web/src/lib/config.ts`.

## 1. Remove the old shop's secrets and data first

If step 0 was done with the robocopy command, most of this is already handled. Check each item anyway, because this code came from the old project and may still carry its real keys and local data:

- Empty every value in these files. Keep the variable names and comments, but leave everything after `=` blank:
  - `.env` (root)
  - `apps/api/.env`
  - `apps/web/.env.local`
  - `apps/admin/.env` (create it if it is missing)
- Delete `.data/`. It holds the old local database, the dev admin login (`dev-admin.txt`), uploaded media and the email outbox.
- Delete `.git/` and run `git init` so the new site does not carry the old repository's history.
- Delete `legacy/`, `test-results/` and any `.next/` or `dist/` folders.
- Delete `node_modules/` and run `npm install` fresh.

Use the `.env.example` file next to each one as the list of variables. Every variable the code reads is listed there.

## 2. Empty environment files to fill in

Do not invent values. Leave them blank and tell me which ones I need to fill in and where to get each one.

**Root `.env`**: `SUPABASE_DB_URL` (Supabase > Connect > Session pooler). Only used by `npm run db:push` and `npm run db:backup`.

**`apps/api/.env`**:
- Server: `NODE_ENV`, `PORT`, `LOG_LEVEL`, `CORS_ORIGINS`, `ADMIN_ORIGIN`, `SITE_URL`, `API_PUBLIC_URL`, `TRUST_PROXY`, `COOKIE_SECURE`
- Database: `DATABASE_URL`
- Shop: `SHOP_CURRENCY` (FJD), `TAX_ENABLED`, `TAX_RATE`
- PayPal: `PAYPAL_ENV`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_CURRENCY` (PayPal cannot charge FJD; use AUD, NZD or USD)
- Email (Resend): `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY`
- Cloudflare Turnstile: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`
- Storage: `STORAGE_DRIVER`, `SUPABASE_STORAGE_BUCKET`, `SUPABASE_VIDEO_BUCKET`
- Supabase: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `AUTH_URL` (local only)

**`apps/web/.env.local`**: `SITE_URL`, `API_URL`, `NEXT_PUBLIC_API_URL`, `MEDIA_ORIGIN`, `ALLOW_INDEXING`, `CSP_REPORT_ONLY`

**`apps/admin/.env`**: `VITE_API_URL`

Production refuses to start unless these are set: `CORS_ORIGINS`, `ADMIN_ORIGIN`, `DATABASE_URL`, both Turnstile keys, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `RESEND_API_KEY`. Production also requires `EMAIL_PROVIDER=resend`, `STORAGE_DRIVER=supabase` and `COOKIE_SECURE=true`.

Check that `.gitignore` still ignores all `.env` files except `.env.example`.

## 3. Rebrand for the new business

The old shop's name and details are written into the code. Search the whole repo (excluding `node_modules`) for `Online Distributors`, `onlinedistributorsfiji`, `Vatuwaqa` and the old phone numbers and email addresses, and replace them. Known places:

- `apps/web/src/lib/config.ts`: `SITE_NAME`
- `apps/api/src/config/env.ts`: default `EMAIL_FROM` and the example domain in comments
- `.env.example` files: example domains in the comments
- `apps/web/src/lib/contact.ts`, `seo.ts` and the pages under `apps/web/src/app/` (about, contact, delivery, FAQs, privacy)
- `apps/web/src/lib/categoryImages.ts` and `public/images/categories/`: the old shop's categories (stationery, furniture, whiteboards, road safety, school)
- Logos and icons: `here/` (source), then `npm run brand:assets`, plus `apps/web/public/brand/`, `apps/admin/public/` and `apps/web/src/app/` icons
- `package.json` `name`, `README.md`, `CLAUDE.md`, `docs/`, `web/public/.well-known/security.txt`

Rewrite `CLAUDE.md` as the brief for the new business once I give you the details. Do not leave the old brief in place.

## 4. New database

1. Locally: `npm run db:start`, then `npm run db:reset` (migrations plus sample catalogue). Remove the sample catalogue with `npm run db:remove-samples` once real products go in.
2. Production: create a new Supabase project, put its connection string in the root `.env`, then run `npm run db:push`.
3. Create the first admin: `npm run admin:create -- --email <email> --name "<name>" --role owner`.
4. Create the storage buckets named in `SUPABASE_STORAGE_BUCKET` and `SUPABASE_VIDEO_BUCKET`.

Follow `docs/DEPLOYMENT.md` for hosting and `docs/CUTOVER.md` for moving the domain.

## 5. Check it works

Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run dev` (storefront :3000, admin :5173, API :4000). Fix anything the rebrand broke.

## How to work with me

I am a software engineering student and need to explain this project to a tutor. As you go, briefly explain what each part does and why you are changing it, not just the code.
