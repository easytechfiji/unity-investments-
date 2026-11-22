// Runs the API as one long running Node process (local development and `npm start`).
// On Vercel the API runs as a function instead: see api/index.js.
import { bootstrap, StartupError } from './bootstrap.js';
import { ConfigError } from './config/env.js';

async function start(): Promise<void> {
  let started;
  try {
    started = await bootstrap(process.env);
  } catch (error) {
    if (error instanceof ConfigError || error instanceof StartupError) {
      process.stderr.write(error.message + '\n');
      process.exit(1);
    }
    throw error;
  }
  const { app, config, db, logger } = started;

  const server = app.listen(config.PORT, () => {
    logger.info('api listening', { port: config.PORT, env: config.NODE_ENV });
  });

  const shutdown = (signal: string) => {
    logger.info('shutting down', { signal });
    server.close(() => {
      void db.close().then(() => process.exit(0));
    });
    // Do not hang forever on open connections.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void start();
