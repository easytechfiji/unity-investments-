// Runs the fake Supabase Auth server for local development (port 54399) or the
// browser tests (FAKE_AUTH_PORT). Users are kept in .data. Development only.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { startFakeAuth } from './fakeAuth.js';

const dataDir = resolve(import.meta.dirname, '..', '..', '..', '.data');
mkdirSync(dataDir, { recursive: true });

const auth = await startFakeAuth({
  port: Number(process.env.FAKE_AUTH_PORT ?? 54399),
  dataFile: resolve(dataDir, process.env.FAKE_AUTH_DATA ?? 'fake-auth.json'),
  serviceKey: 'local-development-service-key',
});
console.log(`Fake auth server (development only) at ${auth.url}`);
