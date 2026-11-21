import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { AppConfig } from '../config/env.js';

// Video is not re-encoded by the API the way images are (Appendix B uploads
// rules are for images). The loader script sends an already re-encoded,
// already small MP4 straight through. This store only checks that the file
// really is an MP4 and gives it a random name, then stores it.

export const MAX_VIDEO_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Recognises an MP4 container from its first bytes. The file name is never trusted. */
export function detectVideoType(buffer: Buffer): 'mp4' | null {
  if (buffer.length < 12) return null;
  const box = buffer.subarray(4, 8).toString('ascii');
  return box === 'ftyp' ? 'mp4' : null;
}

export interface VideoStore {
  /** Stores an already encoded MP4 file. Returns the storage key. */
  saveVideo(upload: Buffer): Promise<string>;
  videoUrl(key: string | null): string | null;
}

const KEY_PATTERN = /^products\/\d{4}\/[0-9a-f]{32}$/;

function newKey(): string {
  return `products/${new Date().getUTCFullYear()}/${randomBytes(16).toString('hex')}`;
}

function checkUpload(upload: Buffer): void {
  if (upload.length > MAX_VIDEO_UPLOAD_BYTES) {
    throw new Error('Videos must be 20 MB or smaller.');
  }
  if (!detectVideoType(upload)) {
    throw new Error('Upload an MP4 video.');
  }
}

export function createVideoStore(config: AppConfig): VideoStore {
  if (config.STORAGE_DRIVER === 'supabase') return supabaseVideoStore(config);
  return localVideoStore(config);
}

/** Development: files under .data/media-video, served by the API at /videos. */
function localVideoStore(config: AppConfig): VideoStore {
  const root = resolve(config.VIDEO_DIR);
  return {
    async saveVideo(upload) {
      checkUpload(upload);
      const key = newKey();
      const path = join(root, `${key}.mp4`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, upload);
      return key;
    },
    videoUrl(key) {
      if (!key || !KEY_PATTERN.test(key)) return null;
      return `${config.API_PUBLIC_URL}/videos/${key}.mp4`;
    },
  };
}

/** Production: Supabase Storage, in its own bucket with public read for video only. */
function supabaseVideoStore(config: AppConfig): VideoStore {
  const base = `${config.SUPABASE_URL}/storage/v1/object`;
  const bucket = config.SUPABASE_VIDEO_BUCKET;
  return {
    async saveVideo(upload) {
      checkUpload(upload);
      const key = newKey();
      const response = await fetch(`${base}/${bucket}/${key}.mp4`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.SUPABASE_SECRET_KEY}`,
          apikey: config.SUPABASE_SECRET_KEY ?? '',
          'Content-Type': 'video/mp4',
          'Cache-Control': 'max-age=31536000',
        },
        body: new Uint8Array(upload),
      });
      if (!response.ok)
        throw new Error(`Video storage upload failed with status ${response.status}`);
      return key;
    },
    videoUrl(key) {
      if (!key || !KEY_PATTERN.test(key)) return null;
      return `${base}/public/${bucket}/${key}.mp4`;
    },
  };
}
