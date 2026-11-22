# Old URLs from the previous Unity Investment site

The previous site (VAULT, a catalogue on Vercel) had only two kinds of address:

| Old address                  | New address                    | How                                       |
| ---------------------------- | ------------------------------ | ----------------------------------------- |
| `/`                          | `/`                            | Same address                              |
| `/category/blankets-bedding` | `/collection/blankets-bedding` | 301 redirect in `apps/web/next.config.ts` |
| `/category/<any other slug>` | `/collection` (all categories) | 301 redirect in `apps/web/next.config.ts` |

The shop now sells bedding only, so the old site's other categories (vehicles, electronics,
home-goods, phones-tablets, daily-essentials) send visitors to the list of categories.

The old site had no product pages, so no product addresses need redirects. Any other old
address can get a redirect in the admin (Redirects page).
