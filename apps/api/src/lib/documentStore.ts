import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { AppConfig } from '../config/env.js';

// Where the PDFs of issued documents are kept. Unlike product photos they are
// private: the bucket is not public, and only the API (with the secret key) can
// read them, for a signed in admin.

export interface DocumentStore {
  /** Stores a PDF and returns its key. */
  save(pdf: Buffer): Promise<string>;
  /** Reads a stored PDF back. Null if it is not there. */
  read(key: string): Promise<Buffer | null>;
}

const KEY_PATTERN = /^\d{4}\/[0-9a-f]{32}\.pdf$/;

function newKey(): string {
  return `${new Date().getUTCFullYear()}/${randomBytes(16).toString('hex')}.pdf`;
}

function checkKey(key: string): void {
  if (!KEY_PATTERN.test(key)) throw new Error('Invalid document key');
}

export function createDocumentStore(config: AppConfig): DocumentStore {
  if (config.STORAGE_DRIVER === 'supabase') return supabaseDocumentStore(config);
  return localDocumentStore(config);
}

/** Development and tests: files under .data/documents. Never served directly. */
function localDocumentStore(config: AppConfig): DocumentStore {
  const root = resolve(config.DOCUMENTS_DIR);
  return {
    async save(pdf) {
      const key = newKey();
      const path = join(root, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, pdf);
      return key;
    },
    async read(key) {
      checkKey(key);
      try {
        return await readFile(join(root, key));
      } catch {
        return null;
      }
    },
  };
}

/** Production: a private Supabase Storage bucket. */
function supabaseDocumentStore(config: AppConfig): DocumentStore {
  const base = `${config.SUPABASE_URL}/storage/v1/object`;
  const bucket = config.SUPABASE_DOCUMENTS_BUCKET;
  const headers = {
    Authorization: `Bearer ${config.SUPABASE_SECRET_KEY}`,
    apikey: config.SUPABASE_SECRET_KEY ?? '',
  };
  return {
    async save(pdf) {
      const key = newKey();
      const response = await fetch(`${base}/${bucket}/${key}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/pdf' },
        body: new Uint8Array(pdf),
      });
      if (!response.ok)
        throw new Error(`Document storage upload failed with status ${response.status}`);
      return key;
    },
    async read(key) {
      checkKey(key);
      const response = await fetch(`${base}/authenticated/${bucket}/${key}`, { headers });
      if (response.status === 404 || response.status === 400) return null;
      if (!response.ok)
        throw new Error(`Document storage download failed with status ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },
  };
}
