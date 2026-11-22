import type { Router } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';

export const STOREFRONT_ORIGIN = 'https://shop.example.test';

export function testApp(routes: Router[] = [], env: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    CORS_ORIGINS: STOREFRONT_ORIGIN,
    ...env,
  });
  return createApp({ config, logger: createLogger('silent'), routes });
}
