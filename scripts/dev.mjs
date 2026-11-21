// Starts everything for local development with one command: `npm run dev`.
//   Postgres 54322, fake auth 54399, API 4000, storefront 3000, admin 5173.
// Stop with Ctrl+C. Postgres keeps running; stop it with `npm run db:stop`.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
execFileSync(process.execPath, ['scripts/db/local.mjs', 'start'], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/db/migrate.mjs', '--local'], {
  cwd: root,
  stdio: 'inherit',
});
execFileSync('npm', ['run', 'build:shared'], { cwd: root, stdio: 'inherit', shell: true });

// The local stand-in for Supabase Auth is only needed when apps/api/.env points at it.
const usesFakeAuth = /^AUTH_URL=\S+/m.test(readFileSync(resolve(root, 'apps/api/.env'), 'utf8'));

const processes = [
  ...(usesFakeAuth ? [['auth', 'npm run dev:auth -w @od/api']] : []),
  ['api', 'npm run dev -w @od/api'],
  ['web', 'npm run dev -w @od/web'],
  ['admin', 'npm run dev -w @od/admin'],
].map(([name, command]) => {
  const child = spawn(command, { cwd: root, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = (chunk) =>
    chunk
      .toString()
      .split('\n')
      .filter(Boolean)
      .map((line) => `[${name}] ${line}`)
      .join('\n');
  child.stdout.on('data', (chunk) => console.log(prefix(chunk)));
  child.stderr.on('data', (chunk) => console.error(prefix(chunk)));
  return child;
});

console.log(
  '\nStorefront http://localhost:3000   Admin http://localhost:5173   API http://localhost:4000\n',
);

const stop = () => {
  for (const child of processes) child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
