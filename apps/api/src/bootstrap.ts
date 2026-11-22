// Builds the API from the environment settings. Shared by the long running server (server.ts)
// and the Vercel function (api/index.js), so both start the app in exactly the same way.
import type { Express } from 'express';
import { createApp } from './app.js';
import { type AppConfig, loadConfig } from './config/env.js';
import { createDb, type Db } from './db.js';
import { createLogger, type Logger } from './lib/logger.js';
import { createServices } from './services/container.js';
import { loadPrivateSettings } from './services/settings.js';

export class StartupError extends Error {
  override name = 'StartupError';
}

export interface Bootstrapped {
  app: Express;
  config: AppConfig;
  db: Db;
  logger: Logger;
}

/**
 * Checks the settings and the database, then builds the app. Throws ConfigError or
 * StartupError with a clear message instead of failing on a customer's first request.
 * `poolMax` is the most database connections this copy of the API may hold open.
 */
export async function bootstrap(
  source: Record<string, string | undefined>,
  options: { poolMax?: number } = {},
): Promise<Bootstrapped> {
  const config = loadConfig(source);
  const logger = createLogger(config.LOG_LEVEL);
  if (!config.DATABASE_URL) {
    throw new StartupError(
      'DATABASE_URL is not set. Run `npm run db:start` and copy apps/api/.env.example.',
    );
  }
  const db = createDb(config.DATABASE_URL, options.poolMax);

  try {
    await loadPrivateSettings(db);
    await db.asAnon((client) => client.query('select 1 from public.public_site_settings'));
  } catch (error) {
    await db.close();
    // A refused connection can arrive with an empty message; fall back to its error code.
    const { message, code } = error as Error & { code?: string };
    throw new StartupError(`Database check failed: ${message || code || 'no reason given'}`);
  }

  const services = createServices({ config, db, logger });
  const app = createApp({ config, logger, services });
  return { app, config, db, logger };
}
