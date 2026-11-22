// The API as a Vercel function. vercel.json sends every request here.
//
// Vercel starts a copy of this function when requests come in and keeps it warm for a while.
// The app (settings check, database pool, services) is built once per copy and reused for
// every request that copy handles. It imports the compiled code in dist/, which the build
// command in vercel.json produces.
//
// The app is loaded with a dynamic import inside a try, not a static import at the top, so
// that if loading fails (a missing file or package) the error is caught and reported instead
// of the whole function crashing with only FUNCTION_INVOCATION_FAILED.

// Several copies can run at once, and each holds its own pool, so keep each pool small to
// stay inside the database's connection limit.
const POOL_MAX = 3;

let starting;

function getApp() {
  starting ??= import('../dist/bootstrap.js')
    .then(({ bootstrap }) => bootstrap(process.env, { poolMax: POOL_MAX }))
    .then(
      (started) => started.app,
      (error) => {
        // Try again on the next request instead of failing forever.
        starting = undefined;
        throw error;
      },
    );
  return starting;
}

/** A short reason that is safe to show: never a connection string or a setting's value. */
function safeReason(error) {
  const text = `${error?.code ?? error?.name ?? 'Error'}: ${error?.message ?? ''}`;
  return text.replace(/postgres(ql)?:\/\/\S+/g, '<database url>').slice(0, 300);
}

export default async function handler(req, res) {
  let app;
  try {
    app = await getApp();
  } catch (error) {
    // The full error goes to the Vercel logs; config errors name settings, never values.
    process.stderr.write(`API could not start: ${error?.stack ?? error}\n`);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: { code: 'unavailable', message: 'Try again shortly.', reason: safeReason(error) },
      }),
    );
    return;
  }
  app(req, res);
}
