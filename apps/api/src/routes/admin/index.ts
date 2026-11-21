import { Router } from 'express';
import { requireAdmin, requireAdminOrigin } from '../../middleware/adminAuth.js';
import type { Services } from '../../services/container.js';
import { adminAuthRoutes } from './auth.js';
import { orderRoutes } from './orders.js';
import { productRoutes } from './products.js';
import { resourceRoutes } from './resources.js';
import { settingsRoutes } from './settings.js';

/**
 * Everything under /v1/admin. The origin check runs first, then sign in routes,
 * then every other admin route requires a two-factor admin session.
 */
export function adminRoutes(services: Services): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAdminOrigin(services.config));
  router.use('/auth', adminAuthRoutes(services));
  router.use(requireAdmin(services));
  // Specific routers before the generic /:resource one, so their paths win.
  router.use(productRoutes(services));
  router.use(orderRoutes(services));
  router.use(settingsRoutes(services));
  router.use(resourceRoutes(services));
  return router;
}
