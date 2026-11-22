import { Router } from 'express';
import type { Db } from '../db.js';

// Used by uptime monitoring. Says only whether the API and its database are
// up; no versions or internal details that would help an attacker.
export function healthRoutes(db?: Db): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    if (db) {
      try {
        await db.query('select 1');
      } catch {
        res.status(503).json({ status: 'database_unavailable' });
        return;
      }
    }
    res.json({ status: 'ok' });
  });
  return router;
}
