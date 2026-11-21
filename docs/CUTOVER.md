# Cutover plan

Switching unityfj.com from the old VAULT catalogue to the new shop without breaking email or
Google rankings. Write the dates in with the owner and rehearse sections 2 to 4 on staging first.

## 1. Before (at least a week ahead)

- [ ] Staging has run for at least a week, behind a login, `noindex`.
- [ ] A full test purchase on staging by bank transfer and by PayPal sandbox, with the right emails and totals.
- [ ] Real products, categories (with the old slugs in `docs/OLD-URLS.md`), delivery regions, pages and FAQs entered on production through the admin. `npm run db:remove-samples` (with the production database) shows nothing left, and the admin dashboard shows no sample warning.
- [ ] Bank details, shop email, phone, address and the PayPal exchange rate checked in admin Settings.
- [ ] Keys of the old VAULT Supabase project reviewed: if the new shop uses a new Supabase project, rotate or delete the old project's secret key once its photos are copied.
- [ ] `docs/SECURITY-REVIEW.md` has no open high findings.
- [ ] Backups on in Supabase; `npm run db:backup` against production works and `npm run db:restore-test <file>` passes.
- [ ] Record today's Google positions for the phrases the owner cares about (for example "Unity Investment Fiji", "Unity Investment Nakasi").
- [ ] Old URLs checked: `/` and every `/category/<slug>` from `docs/OLD-URLS.md` load or redirect once on staging. Crawl staging: no broken links, one H1, a title, a description and a canonical on every page.
- [ ] Choose a quiet time (for example Sunday evening Fiji time) and tell the owner.

## 2. DNS preparation (48 hours ahead)

- [ ] Export or screenshot every DNS record at the current provider. **Especially MX, SPF (TXT), DKIM (TXT) and any other TXT records**: these keep the business email working.
- [ ] Lower the TTL of the `@` and `www` records to 300 seconds.
- [ ] If moving to Cloudflare: add the site to Cloudflare, check that it imported every record (compare with the export line by line), but do not change the name servers yet.

## 3. Switch (the quiet time)

- [ ] In Vercel, move the `unityfj.com` and `www.unityfj.com` domains from the old VAULT project to the new storefront project (`apps/web`). If the domain is not on Vercel yet, change only the `@` and `www` records to point at Vercel.
- [ ] Add `api` and `admin` records.
- [ ] Wait for the new site to answer on https://unityfj.com (check from a phone on mobile data too).
- [ ] **Send an email to the shop address from an outside account and check it arrives.** If not, the mail records are wrong: compare with the export at once.
- [ ] Place a real small order by bank transfer, then cancel it in the admin (stock comes back).
- [ ] Check `/category/blankets-bedding` and `/category/electronics`: each redirects once with a 301.
- [ ] Check `http://` and `www.` both end on `https://unityfj.com/` in one hop.

## 4. If something goes wrong

- Move the domain back to the old VAULT project in Vercel (or point `@` and `www` back; the TTL is short, so this takes minutes). Mail records were never touched.
- Keep the old VAULT project for about two weeks after the switch.

## 5. After launch

- [ ] Search Console: verify the domain, submit `https://unityfj.com/sitemap.xml`.
- [ ] Uptime checks on the home page and `https://api.unityfj.com/health` (a free monitor is enough), with alerts to Sultan and the owner.
- [ ] Error alerts: the host's log alerts for many 5xx responses and for repeated "admin sign in failed" warnings.
- [ ] Google Business Profile: claim or update it with the same name, address and phone as the website footer.
- [ ] Check Search Console every week for the first month: coverage, Core Web Vitals, any 404s.
- [ ] Weekly `npm run db:backup` stored outside Supabase; a restore test every three months.
- [ ] After two weeks without problems: delete the old VAULT Vercel project.
- [ ] Turn on HSTS preload only when every subdomain is on HTTPS for good.
