# Status (20 November 2026)

The shop code is in place and rebranded for Unity Investment on the local `ecommerce-conversion`
branch. Nothing is committed or pushed. Nothing is deployed, because that needs the new keys.

## Run it

1. `npm run db:start` then `npm run db:reset` (local Postgres 17 with the sample catalogue).
2. `npm run dev` (storefront http://localhost:3000, admin http://localhost:5173, API http://localhost:4000).
3. Local admin sign in: `.data/dev-admin.txt` (local stand-in for Supabase Auth, development only).

## Documents

- `docs/SECURITY-REVIEW.md`: every security item with status and evidence (written for the original shop; the code is the same).
- `docs/DEPLOYMENT.md`: setting up Supabase, the API host, Vercel and Cloudflare.
- `docs/CUTOVER.md`: moving unityfj.com from the old VAULT site without breaking email.
- `docs/OLD-URLS.md`: the old VAULT addresses and their redirects.
- `docs/LEARNING-LOG.md`: what was built and why.

## Still needs Sultan

- Keys in the `.env` files (see `ECOMMERCE-SETUP.md` step 2): Supabase, PayPal (and which currency it charges), Resend, Turnstile, an API host.
- A Supabase project for the shop, then `npm run db:push`, the first admin account and the storage buckets.
- Real products entered through the admin, real delivery prices, bank details.
- Decisions: shop email address and domain, VAT, opening hours.
- Launch day tasks in `docs/CUTOVER.md`.
