import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config/env.js';
import { createDb } from './db.js';
import { createLogger } from './lib/logger.js';
import { createServices } from './services/container.js';
import { loadPrivateSettings } from './services/settings.js';

async function start(): Promise<void> {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(error.message + '\n');
      process.exit(1);
    }
    throw error;
  }

  const logger = createLogger(config.LOG_LEVEL);
  if (!config.DATABASE_URL) {
    process.stderr.write(
      'DATABASE_URL is not set. Run `npm run db:start` and copy apps/api/.env.example.\n',
    );
    process.exit(1);
  }
  const db = createDb(config.DATABASE_URL);

  // Fail at startup, with a clear message, rather than on a customer's first request.
  try {
    await loadPrivateSettings(db);
    await db.asAnon((client) => client.query('select 1 from public.public_site_settings'));
  } catch (error) {
    process.stderr.write(`Database check failed: ${(error as Error).message}\n`);
    process.exit(1);
  }

  const services = createServices({ config, db, logger });
  const app = createApp({ config, logger, services });

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
