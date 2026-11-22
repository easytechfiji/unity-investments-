# Unity Investment: brand source files

| File             | What it is                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `unity-logo.png` | Full logo, 3000 x 895 px PNG, transparent background. Emblem on the left, "UNITY" on the right. |

`npm run brand:assets` turns it into the website's logo files, favicons and share image
(see `scripts/brand/make-assets.mjs`). Replace the PNG and run it again for a new logo.

## Colours

Measured from the logo pixels:

| Logo colour | Hex       | Contrast on white |
| ----------- | --------- | ----------------- |
| Blue        | `#1880c0` | 4.3               |
| Orange      | `#f8b040` | 1.9               |
| Grey        | `#a0a8a8` | 2.3               |

The logo blue and orange are too light for text on white (WCAG AA needs 4.5), so the website
uses darker shades of the same hues in `apps/web/src/styles/globals.css`:

| Site token | Hex       | Contrast on white | Used for                     |
| ---------- | --------- | ----------------- | ---------------------------- |
| `--navy`   | `#13649a` | 6.3               | Headings, links, header band |
| `--red`    | `#b35c00` | 4.7               | Buttons, accents, focus ring |

(The token names are kept from the original code so nothing else had to change.)
