// The API as a Vercel function. vercel.json sends every request here.
//
// Vercel starts a copy of this function when requests come in and keeps it warm for a while.
// The app (settings check, database pool, services) is built once per copy and reused for
// every request that copy handles. It imports the compiled code in dist/, which the build
// command in vercel.json produces.
import { bootstrap } from '../dist/bootstrap.js';

// Several copies can run at once, and each holds its own pool, so keep each pool small to
// stay inside the database's connection limit.
const POOL_MAX = 3;

let starting;

function getApp() {
  starting ??= bootstrap(process.env, { poolMax: POOL_MAX }).then(
    (started) => started.app,
    (error) => {
      // Try again on the next request instead of failing forever. The message names the
      // setting that is wrong, never its value.
      starting = undefined;
      throw error;
    },
  );
  return starting;
}

export default async function handler(req, res) {
  let app;
  try {
    app = await getApp();
  } catch (error) {
    process.stderr.write(`API could not start: ${error.message}\n`);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'unavailable', message: 'Try again shortly.' } }));
    return;
  }
  app(req, res);
}
