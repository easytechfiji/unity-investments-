# VAULT

> A premium multi-category product showcase built with React, Node.js, and Supabase. Silky motion, clean editorial design, and a dead-simple content workflow — update products directly in Supabase, no code deploys needed.

---

## What this is

VAULT is a product display site. The frontend is React with Framer Motion animations. The backend is a Node.js/Express API talking to Supabase. Content — products, images, descriptions, categories — is managed entirely from the Supabase dashboard. Hosted on Vercel with automatic deploys from GitHub.

---

## Tech stack

| Layer | Tool |
|---|---|
| Frontend | React (Vite) |
| Animations | Framer Motion |
| Backend | Node.js + Express |
| Database | Supabase (PostgreSQL) |
| File storage | Supabase Storage |
| Auth | Supabase Auth + JWT |
| Hosting | Vercel |
| CI/CD | GitHub Actions |
| Editor | VS Code |

---

## Project structure

```
/
├── client/                              # React frontend (Vite)
│   ├── src/
│   │   ├── main.jsx                     # Entry point
│   │   ├── App.jsx                      # Route definitions
│   │   ├── pages/
│   │   │   ├── Home.jsx                 # Hero → Catalogue preview → Info → Contact
│   │   │   └── Category.jsx             # /category/:slug — full item grid
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Nav.jsx
│   │   │   │   ├── Footer.jsx
│   │   │   │   └── Layout.jsx
│   │   │   ├── home/
│   │   │   │   ├── Hero.jsx
│   │   │   │   ├── CataloguePreview.jsx
│   │   │   │   ├── CategoryCard.jsx
│   │   │   │   ├── InfoSection.jsx
│   │   │   │   └── Contact.jsx
│   │   │   └── catalogue/
│   │   │       ├── CategoryHero.jsx
│   │   │       ├── ItemGrid.jsx
│   │   │       ├── ItemCard.jsx
│   │   │       ├── SearchBar.jsx
│   │   │       └── Pagination.jsx
│   │   ├── hooks/
│   │   │   ├── useItems.js
│   │   │   └── useCategories.js
│   │   ├── lib/
│   │   │   └── supabase.js              # Anon client — browser safe
│   │   ├── styles/
│   │   │   ├── globals.css
│   │   │   ├── animations.css
│   │   │   └── components.css
│   │   └── utils/
│   │       ├── formatters.js
│   │       └── motion.js               # Shared Framer Motion variants
│
├── server/                              # Node.js + Express API
│   ├── index.js
│   ├── routes/
│   │   ├── items.js
│   │   ├── categories.js
│   │   ├── auth.js
│   │   └── admin.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── validate.js
│   │   ├── rateLimit.js
│   │   └── security.js
│   └── lib/
│       ├── supabase.js
│       └── supabaseAdmin.js             # Service-role client — server only
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/                             # Playwright
│
├── .github/workflows/ci.yml
├── .env.example
├── vercel.json
└── package.json
```

---

## Routes

| URL | Component | Description |
|---|---|---|
| `/` | `Home.jsx` | Hero, catalogue preview, info, contact |
| `/category/cars` | `Category.jsx` | Full cars catalogue |
| `/category/phones` | `Category.jsx` | Full phones catalogue |
| `/category/tyres` | `Category.jsx` | Full tyres catalogue |
| `/category/:slug` | `Category.jsx` | Any category — works automatically |

`Category.jsx` reads the slug from the URL via `useParams()`, passes it to `useItems(slug)`, which calls `GET /api/items?category=slug`. One component handles every category page.

---

## API reference

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/items` | None | All published items — supports `?category=` `?page=` `?limit=` |
| `GET` | `/api/items/:id` | None | Single item |
| `GET` | `/api/categories` | None | All categories |
| `POST` | `/api/auth/login` | None | Login, returns JWT |
| `POST` | `/api/auth/logout` | JWT | End session |
| `POST` | `/api/admin/items` | JWT | Create item |
| `PUT` | `/api/admin/items/:id` | JWT | Update item |
| `DELETE` | `/api/admin/items/:id` | JWT | Delete item |

---

## Local setup

### 1. Clone and install

```bash
git clone https://github.com/your-username/vault.git
cd vault
npm install
cd client && npm install
cd ../server && npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=item-images

# Auth
JWT_SECRET=your-long-random-secret

# App
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
VITE_API_URL=http://localhost:4000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Resend contact form
RESEND_API_KEY=re_your-resend-api-key
RESEND_FROM_EMAIL="Unity Investment <onboarding@resend.dev>"
CONTACT_EMAIL_TO=you@example.com
```

> `SUPABASE_SERVICE_ROLE_KEY` and `JWT_SECRET` are server-side only. Never prefix them with `VITE_` — Vite would expose them to the browser.

### 3. Run locally

```bash
# From root — runs both client (port 5173) and server (port 4000) concurrently
npm run dev
```

---

## Supabase setup

Run this in the **Supabase SQL editor**:

```sql
-- Categories
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  sort_order integer default 0,
  cover_image_url text,
  created_at timestamptz default now()
);

-- Items
create table items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category_id uuid references categories(id),
  price numeric(10, 2),
  image_path text,
  image_url text,
  tags text[],
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- If your tables already exist, run this instead of recreating them:
alter table categories add column if not exists sort_order integer default 0;
alter table items add column if not exists price numeric(10, 2);
alter table items add column if not exists image_path text;
alter table items add column if not exists image_url text;
alter table items add column if not exists tags text[] default '{}';
alter table items add column if not exists is_active boolean default true;

-- Row Level Security
alter table items enable row level security;
alter table categories enable row level security;

create policy "Public read published items"
  on items for select using (is_active = true);

create policy "Public read categories"
  on categories for select using (true);
```

**Storage bucket:**
1. Supabase → Storage → New bucket → name it `item-images` → set to public
2. Upload product images here, copy the path inside the bucket, and paste it into the `image_path` field on the item row. Example: `vehicles/car-1.jpg`

---

## How to manage content

No code. No deploys. Everything happens in the Supabase dashboard.

**Add a product:**
1. Upload image to Storage → `item-images`, then copy the file path inside the bucket
2. Table editor → `items` → Insert row
3. Fill in `name`, `description`, `price`, `category_id`, and `image_path`
4. Set `is_active = true`
5. Live immediately

**Edit a product:**
Find the row in `items`, edit any field, save. Done.

**Hide a product without deleting:**
Set `is_active = false`.

**Add a new category:**
Insert a row into `categories` with a `name` and `slug` (e.g. `watches`). The homepage catalogue preview and the route `/category/watches` work automatically — no code changes needed.

---

## Security

| Measure | Detail |
|---|---|
| HTTPS | Enforced by Vercel, HSTS via Helmet |
| JWT | Verified server-side on every admin request |
| Input validation | Zod schemas reject bad data before it hits the DB |
| SQL injection | Impossible — Supabase JS client uses parameterised queries |
| XSS | Content Security Policy header via Helmet |
| Rate limiting | 100 req / min / IP |
| RLS | Supabase Row Level Security — public users cannot write |
| Secrets | In Vercel + GitHub env vars only, never in source code |
| Service key | Only in `server/lib/supabaseAdmin.js`, never in `client/` |

---

## Tests

```bash
# Unit (Vitest)
npm run test:unit

# Integration (Supertest)
npm run test:integration

# E2E (Playwright)
npm run test:e2e

# All
npm run test
```

---

## CI/CD

Every push triggers GitHub Actions:

```
push / PR
  └── ESLint
  └── Type check
  └── Unit tests
  └── Integration tests
  └── Build (Vite + server)
      └── PR    → Vercel preview URL (auto-posted on PR)
      └── main  → Vercel production deploy
```

---

## Deployment

1. Import the GitHub repo into Vercel
2. Add all env vars to **Vercel → Settings → Environment Variables**
3. Vercel runs the build and deploys — `vercel.json` routes `/api/*` to the Express server and everything else to the React build

Push to `main` → auto-deploy. That's it.

---

## Environment variables reference

| Variable | Used in | Safe to expose? |
|---|---|---|
| `SUPABASE_URL` | Server | ✅ |
| `SUPABASE_ANON_KEY` | Server | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | ❌ Never |
| `SUPABASE_STORAGE_BUCKET` | Server | ✅ |
| `JWT_SECRET` | Server only | ❌ Never |
| `RESEND_API_KEY` | Server only | ❌ Never |
| `RESEND_FROM_EMAIL` | Server only | ✅ |
| `CONTACT_EMAIL_TO` | Server only | ✅ |
| `VITE_SUPABASE_URL` | Client | ✅ |
| `VITE_SUPABASE_ANON_KEY` | Client | ✅ |
| `VITE_API_URL` | Client | ✅ |

---

## License

MIT
