// Runs a private Postgres 17 for development, with its data in .data/pg (gitignored).
//
//   node scripts/db/local.mjs start    start it (creating the data folder the first time)
//   node scripts/db/local.mjs stop     stop it
//   node scripts/db/local.mjs status   say whether it is running
//
// Postgres binaries come from PG_BIN, or the portable build in
// %LOCALAPPDATA%\od-tools\pgsql\bin. In CI a Postgres service container is used instead.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export const LOCAL_PORT = 54322;
export const LOCAL_URL = `postgres://postgres:postgres@localhost:${LOCAL_PORT}/postgres`;

const root = resolve(import.meta.dirname, '..', '..');
const dataDir = join(root, '.data', 'pg');
const logFile = join(root, '.data', 'pg.log');
const exe = process.platform === 'win32' ? '.exe' : '';
const binDir =
  process.env.PG_BIN ??
  join(
    process.env.LOCALAPPDATA ?? join(process.env.HOME ?? '', '.local'),
    'od-tools',
    'pgsql',
    'bin',
  );

function bin(name) {
  const path = join(binDir, name + exe);
  if (!existsSync(path)) {
    console.error(`Cannot find ${path}. Set PG_BIN to the folder holding the Postgres programs.`);
    process.exit(1);
  }
  return path;
}

function isRunning() {
  try {
    execFileSync(bin('pg_ctl'), ['status', '-D', dataDir], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function init() {
  mkdirSync(join(root, '.data'), { recursive: true });
  const pwFile = join(tmpdir(), `od-pg-pw-${process.pid}`);
  writeFileSync(pwFile, 'postgres\n');
  try {
    execFileSync(
      bin('initdb'),
      [
        '-D',
        dataDir,
        '-U',
        'postgres',
        '--pwfile',
        pwFile,
        '--auth=scram-sha-256',
        '-E',
        'UTF8',
        '--locale=C',
      ],
      { stdio: 'inherit' },
    );
  } finally {
    rmSync(pwFile, { force: true });
  }
}

const command = process.argv[2];

if (command === 'start') {
  if (!existsSync(join(dataDir, 'PG_VERSION'))) init();
  if (isRunning()) {
    console.log(`Postgres already running on port ${LOCAL_PORT}.`);
  } else {
    execFileSync(
      bin('pg_ctl'),
      [
        'start',
        '-D',
        dataDir,
        '-l',
        logFile,
        '-w',
        '-o',
        `-p ${LOCAL_PORT} -c listen_addresses=localhost`,
      ],
      // The server process inherits any pipe we give pg_ctl and keeps it open,
      // which would make this script wait forever. Its output goes to the log file instead.
      { stdio: 'ignore' },
    );
    console.log(`Postgres running on port ${LOCAL_PORT}.`);
  }
} else if (command === 'stop') {
  if (isRunning())
    execFileSync(bin('pg_ctl'), ['stop', '-D', dataDir, '-m', 'fast', '-w'], { stdio: 'inherit' });
  else console.log('Postgres is not running.');
} else if (command === 'status') {
  console.log(isRunning() ? `Running on port ${LOCAL_PORT}.` : 'Not running.');
} else {
  console.log('Usage: node scripts/db/local.mjs start|stop|status');
  process.exit(1);
}
