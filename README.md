# Unity Investment

The online shop for Unity Investment, Lot 23, Nakasi, Fiji (unityfj.com). The brief is in `CLAUDE.md`.

## Parts

| Folder                | What                                                  | Stack                        |
| --------------------- | ----------------------------------------------------- | ---------------------------- |
| `apps/web`            | Storefront                                            | Next.js 16, React 19         |
| `apps/admin`          | Admin, on its own subdomain                           | React 19, Vite, React Router |
| `apps/api`            | API: catalogue, cart, checkout, PayPal, emails, admin | Node 22, Express 5           |
| `packages/shared`     | Schemas, money and types used by all three            | zod                          |
| `supabase/migrations` | Database, with Row Level Security                     | Postgres 17 (Supabase)       |
| `scripts`             | Local database, backups, brand assets, checks         | Node                         |
| `docs`                | Security review, deployment, cutover, learning log    |                              |

## Run it on your computer

Needs Node 22 or newer. The first time:

```
npm install
npm run db:start        # a private Postgres 17 on port 54322 (data in .data/)
npm run db:reset        # migrations plus the sample catalogue
```

Then:

```
npm run dev             # storefront :3000, admin :5173, API :4000
```

Local settings are in `apps/api/.env` and `apps/web/.env.local` (both gitignored; the `.env.example` files list every setting). Locally, sign in to the admin with the account in `.data/dev-admin.txt`; it uses a small stand-in for Supabase Auth (`apps/api/dev/fakeAuth.ts`) that never runs in production. Emails are written to `.data/outbox` instead of being sent.

Postgres binaries: `scripts/db/local.mjs` looks in `PG_BIN`, then `%LOCALAPPDATA%\od-tools\pgsql\bin` (the portable build from get.enterprisedb.com).

## Checks

```
npm run typecheck
npm run lint
npm run format:check
npm run check:text      # no em dashes, en dashes or emojis anywhere
npm test                # unit tests and integration tests against Postgres
npm run test:e2e        # browser tests (Playwright) including axe accessibility checks
```

CI runs all of these on every push, plus gitleaks and `npm audit`. The pre-commit hook runs gitleaks and the text check.

## Other commands

| Command                                                         | What                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `npm run admin:create -- --email <e> --name "<n>" --role owner` | Create an admin account (there is no sign up page)                   |
| `npm run db:push`                                               | Apply migrations to Supabase (`SUPABASE_DB_URL` in the root `.env`)  |
| `npm run db:backup`                                             | Backup to `.data/backups` (production when `SUPABASE_DB_URL` is set) |
| `npm run db:restore-test <file>`                                | Restore a backup into a scratch database and compare every table     |
| `npm run db:remove-samples`                                     | Delete the sample catalogue                                          |
| `npm run screenshots`                                           | Screenshots at 360, 768 and 1280 pixels into `.data/screenshots`     |
| `npm run brand:assets`                                          | Rebuild logo files and favicons from `here/`                         |

## Going live

`docs/DEPLOYMENT.md` (setting up Supabase and the three Vercel projects), then `docs/CUTOVER.md` (switching the domain without breaking email or rankings). `docs/SECURITY-REVIEW.md` lists what is done and what is left.
