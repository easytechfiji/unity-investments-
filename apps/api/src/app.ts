import { resolve } from 'node:path';
import cors from 'cors';
import express, { type Router } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config/env.js';
import type { Logger } from './lib/logger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { relaxedLimit } from './middleware/rateLimit.js';
import { requestContext } from './middleware/requestContext.js';
import { adminRoutes } from './routes/admin/index.js';
import { healthRoutes } from './routes/health.js';
import { publicRoutes } from './routes/public.js';
import type { Services } from './services/container.js';

interface AppDeps {
  config: AppConfig;
  logger: Logger;
  // Database backed services. Left out by tests that only check the middleware.
  services?: Services;
  // Extra routers mounted under /v1, used by tests.
  routes?: Router[];
}

export function createApp({ config, logger, services, routes = [] }: AppDeps): express.Express {
  const app = express();

  app.set('trust proxy', config.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(requestContext(logger));

  // The API only ever returns JSON and images, so the content security policy can be "nothing at all".
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex');
    next();
  });

  const allowedOrigins = new Set([
    ...config.CORS_ORIGINS,
    ...(config.ADMIN_ORIGIN ? [config.ADMIN_ORIGIN] : []),
  ]);
  app.use(
    cors({
      origin: (origin, callback) => {
        // No Origin header means a non-browser client (curl, uptime check). CORS does not apply.
        callback(null, origin === undefined || allowedOrigins.has(origin));
      },
      credentials: true,
      maxAge: 600,
      exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    }),
  );

  // Health is mounted before the rate limit so monitoring is never blocked.
  app.use(healthRoutes(services?.db));

  // Locally stored images and videos (development only; production uses Supabase Storage).
  if (config.STORAGE_DRIVER === 'local') {
    const staticOptions = {
      dotfiles: 'deny' as const,
      index: false,
      immutable: true,
      maxAge: '365d',
      setHeaders: (res: express.Response) =>
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
    };
    app.use('/media', express.static(resolve(config.MEDIA_DIR), staticOptions));
    app.use('/videos', express.static(resolve(config.VIDEO_DIR), staticOptions));
  }

  app.use(relaxedLimit(config.RATE_LIMIT_SCALE));

  if (services) {
    // Admin product descriptions can be long, so admin requests get a larger body limit.
    app.use('/v1/admin', express.json({ limit: '300kb', strict: true }), adminRoutes(services));
  }
  app.use(express.json({ limit: '20kb', strict: true }));
  if (services) app.use('/v1', publicRoutes(services));
  for (const router of routes) app.use('/v1', router);

  app.use(notFound);
  app.use(errorHandler(logger, config.NODE_ENV === 'production'));

  return app;
}
