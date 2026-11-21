import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ImageSet } from '@od/shared';
import sharp from 'sharp';
import type { AppConfig } from '../config/env.js';
import { HttpError } from './errors.js';

// Every image is stored at these widths, as WebP. The storefront picks one with srcset.
export const IMAGE_WIDTHS = [400, 800, 1600] as const;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;

export type ImageFolder = 'products' | 'categories' | 'subcategories' | 'banners' | 'site';

/** Recognises JPEG, PNG and WebP from their first bytes. The file name is never trusted. */
export function detectImageType(buffer: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return 'jpeg';
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export interface MediaStore {
  /** Re-encodes an uploaded image and stores every size. Returns the storage key. */
  saveImage(folder: ImageFolder, upload: Buffer): Promise<string>;
  deleteImage(key: string): Promise<void>;
  imageSet(key: string | null): ImageSet | null;
}

const KEY_PATTERN = /^(products|categories|subcategories|banners|site)\/\d{4}\/[0-9a-f]{32}$/;

function newKey(folder: ImageFolder): string {
  return `${folder}/${new Date().getUTCFullYear()}/${randomBytes(16).toString('hex')}`;
}

async function encodeSizes(upload: Buffer): Promise<{ width: number; data: Buffer }[]> {
  if (upload.length > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, 'image_too_large', 'Images must be 8 MB or smaller.');
  }
  if (!detectImageType(upload)) {
    throw new HttpError(415, 'unsupported_image', 'Upload a JPG, PNG or WebP image.');
  }
  try {
    const source = sharp(upload, { limitInputPixels: MAX_PIXELS, failOn: 'error' });
    const metadata = await source.metadata();
    if (!metadata.width || !metadata.height) throw new Error('No dimensions');
    return await Promise.all(
      IMAGE_WIDTHS.map(async (width) => ({
        width,
        // rotate() applies the camera orientation, then sharp drops all metadata (EXIF, GPS).
        data: await sharp(upload, { limitInputPixels: MAX_PIXELS })
          .rotate()
          .resize({ width, withoutEnlargement: true })
          .flatten({ background: '#ffffff' })
          .webp({ quality: 80 })
          .toBuffer(),
      })),
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(415, 'unreadable_image', 'That image could not be read.');
  }
}

function srcSet(urlFor: (width: number) => string): ImageSet {
  return {
    src: urlFor(800),
    srcSet: IMAGE_WIDTHS.map((width) => `${urlFor(width)} ${width}w`).join(', '),
  };
}

export function createMediaStore(config: AppConfig): MediaStore {
  if (config.STORAGE_DRIVER === 'supabase') return supabaseStore(config);
  return localStore(config);
}

/** Development: files under .data/media, served by the API at /media. */
function localStore(config: AppConfig): MediaStore {
  const root = resolve(config.MEDIA_DIR);
  return {
    async saveImage(folder, upload) {
      const key = newKey(folder);
      for (const { width, data } of await encodeSizes(upload)) {
        const path = join(root, `${key}-${width}.webp`);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, data);
      }
      return key;
    },
    async deleteImage(key) {
      if (!KEY_PATTERN.test(key)) return;
      await Promise.all(
        IMAGE_WIDTHS.map((width) => rm(join(root, `${key}-${width}.webp`), { force: true })),
      );
    },
    imageSet(key) {
      if (!key || !KEY_PATTERN.test(key)) return null;
      return srcSet((width) => `${config.API_PUBLIC_URL}/media/${key}-${width}.webp`);
    },
  };
}

/** Production: Supabase Storage, in a bucket with public read for images only. */
function supabaseStore(config: AppConfig): MediaStore {
  const base = `${config.SUPABASE_URL}/storage/v1/object`;
  const bucket = config.SUPABASE_STORAGE_BUCKET;
  const headers = {
    Authorization: `Bearer ${config.SUPABASE_SECRET_KEY}`,
    apikey: config.SUPABASE_SECRET_KEY ?? '',
  };
  return {
    async saveImage(folder, upload) {
      const key = newKey(folder);
      for (const { width, data } of await encodeSizes(upload)) {
        const response = await fetch(`${base}/${bucket}/${key}-${width}.webp`, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'image/webp',
            'Cache-Control': 'max-age=31536000',
          },
          body: new Uint8Array(data),
        });
        if (!response.ok) throw new Error(`Storage upload failed with status ${response.status}`);
      }
      return key;
    },
    async deleteImage(key) {
      if (!KEY_PATTERN.test(key)) return;
      await fetch(`${base}/${bucket}`, {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: IMAGE_WIDTHS.map((width) => `${key}-${width}.webp`) }),
      });
    },
    imageSet(key) {
      if (!key || !KEY_PATTERN.test(key)) return null;
      return srcSet((width) => `${base}/public/${bucket}/${key}-${width}.webp`);
    },
  };
}
