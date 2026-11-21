// Creates the two Supabase Storage buckets the API writes to (docs/DEPLOYMENT.md, Supabase step 5).
//
//   npm run storage:buckets
//
// Uses SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_STORAGE_BUCKET and SUPABASE_VIDEO_BUCKET from
// the env file. Both buckets are public to read, so the storefront can show the files, but only
// the API (holding the secret key) can write. Each one only accepts the one file type the API
// produces. Safe to run again: an existing bucket has its settings brought back to these.
import { MAX_UPLOAD_BYTES } from '../src/lib/media.js';
import { MAX_VIDEO_UPLOAD_BYTES } from '../src/lib/video.js';
import { loadConfig } from '../src/config/env.js';

const config = loadConfig(process.env);
if (!config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY first.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${config.SUPABASE_SECRET_KEY}`,
  apikey: config.SUPABASE_SECRET_KEY,
  'Content-Type': 'application/json',
};
const buckets = [
  {
    id: config.SUPABASE_STORAGE_BUCKET,
    allowed_mime_types: ['image/webp'],
    file_size_limit: MAX_UPLOAD_BYTES,
  },
  {
    id: config.SUPABASE_VIDEO_BUCKET,
    allowed_mime_types: ['video/mp4'],
    file_size_limit: MAX_VIDEO_UPLOAD_BYTES,
  },
];

let failed = false;
for (const bucket of buckets) {
  const body = JSON.stringify({ ...bucket, name: bucket.id, public: true });
  const base = `${config.SUPABASE_URL}/storage/v1/bucket`;
  const created = await fetch(base, { method: 'POST', headers, body });
  if (created.ok) {
    console.log(`Created bucket ${bucket.id}.`);
    continue;
  }
  // Already there: update it so the settings match.
  const updated = await fetch(`${base}/${bucket.id}`, { method: 'PUT', headers, body });
  if (updated.ok) console.log(`Bucket ${bucket.id} already existed; settings updated.`);
  else {
    console.error(
      `Could not create bucket ${bucket.id} (status ${created.status}, ${updated.status}).`,
    );
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
