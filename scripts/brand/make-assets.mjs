// Builds the website's logo files, favicons and share image from the logo in here/.
// Run again with `npm run brand:assets` when a new logo arrives (replace here/unity-logo.png).
//
// The source is the full Unity Investment logo: a 3000 x 895 PNG with a transparent
// background. On the left is the round emblem (three figures in blue, orange and grey),
// on the right the word UNITY and the company line. The square files (header logo,
// favicons) use the emblem only, because the wordmark is unreadable at 32 to 64 px.
// The header shows the business name as text beside it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..', '..');
const SOURCE = join(root, 'here', 'unity-logo.png');
const web = join(root, 'apps', 'web');
const admin = join(root, 'apps', 'admin');

// The emblem sits in the first 934 px columns of the source (measured from its pixels).
const EMBLEM = { left: 0, top: 0, width: 934, height: 895 };
const clearBg = { r: 0, g: 0, b: 0, alpha: 0 };

/** The emblem centred on a transparent square of the given size, with a small margin. */
async function emblemSquare(size, pad = Math.round(size * 0.04)) {
  const art = await sharp(SOURCE)
    .extract(EMBLEM)
    .resize(size - pad * 2, size - pad * 2, { fit: 'contain', background: clearBg })
    .png()
    .toBuffer();
  return sharp(art)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: clearBg })
    .png()
    .toBuffer();
}

mkdirSync(join(web, 'public', 'brand'), { recursive: true });
mkdirSync(join(admin, 'public'), { recursive: true });

// Header logo at 1x and 2x of its 64 px display size, plus a large one.
for (const size of [64, 128, 350]) {
  await sharp(await emblemSquare(size))
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(join(web, 'public', 'brand', `logo-${size}.webp`));
}
// The full logo (emblem and wordmark) for print and anything that needs the whole thing.
await sharp(SOURCE)
  .png()
  .toFile(join(web, 'public', 'brand', 'logo.png'));
await sharp(await emblemSquare(96))
  .webp({ quality: 90 })
  .toFile(join(admin, 'public', 'logo-96.webp'));

// Favicons: the emblem alone. Apple icons cannot be transparent, so that one is on white.
await sharp(await emblemSquare(192))
  .png({ palette: true })
  .toFile(join(web, 'src', 'app', 'icon.png'));
await sharp(await emblemSquare(180, 14))
  .flatten({ background: '#ffffff' })
  .png()
  .toFile(join(web, 'src', 'app', 'apple-icon.png'));
await sharp(await emblemSquare(64))
  .png()
  .toFile(join(admin, 'public', 'favicon.png'));

// Share image for Facebook and other sites: the full logo centred on white, 1200 x 630.
const wide = await sharp(SOURCE)
  .resize(1000, 400, { fit: 'contain', background: clearBg })
  .png()
  .toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#ffffff' } })
  .composite([{ input: wide, left: 100, top: 115 }])
  .png()
  .toFile(join(web, 'src', 'app', 'opengraph-image.png'));

// The full logo for the API's PDF documents (invoices, receipts and the rest), flattened on white
// and kept as base64 inside a source file, so the PDF code needs no extra file on Vercel.
const pdfLogo = await sharp(SOURCE)
  .resize({ width: 900 })
  .flatten({ background: '#ffffff' })
  .png({ compressionLevel: 9, palette: true })
  .toBuffer();
const pdfLogoHeight = (await sharp(pdfLogo).metadata()).height;
writeFileSync(
  join(root, 'apps', 'api', 'src', 'lib', 'documentLogo.ts'),
  [
    '// Made by scripts/brand/make-assets.mjs from here/unity-logo.png. Do not edit by hand.',
    `/** The full Unity logo as a PNG, 900 px wide. */`,
    `export const DOCUMENT_LOGO_PNG = Buffer.from('${pdfLogo.toString('base64')}', 'base64');`,
    '/** Height divided by width. */',
    `export const DOCUMENT_LOGO_RATIO = ${(pdfLogoHeight / 900).toFixed(4)};`,
    '',
  ].join('\n'),
);

console.log('Brand assets written.');
