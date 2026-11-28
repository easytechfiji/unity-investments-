import { defineConfig, devices } from '@playwright/test';

// Browser tests run the whole system on separate ports, against its own
// database (od_e2e), so they never touch development data:
//   fake auth 54499, API 4100, storefront 3100, admin 5174.
// Needs Postgres (npm run db:start locally, a service container in CI).

export const E2E = {
  api: 'http://localhost:4100',
  web: 'http://localhost:3100',
  admin: 'http://localhost:5174',
  auth: 'http://127.0.0.1:54499/auth/v1',
  database: (
    process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:54322/postgres'
  ).replace(/\/postgres$/, '/od_e2e'),
};

export default defineConfig({
  testDir: './e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  use: { baseURL: E2E.web, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testIgnore: /mobile\.spec/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 780 } },
      testMatch: /(mobile|smoke|a11y)\.spec/,
    },
  ],
  webServer: [
    {
      command: 'npx tsx ../api/dev/fake-auth-server.ts',
      url: `${E2E.auth}/.well-known/jwks.json`,
      env: { FAKE_AUTH_PORT: '54499', FAKE_AUTH_DATA: 'fake-auth-e2e.json' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node ../../scripts/db/e2e-prepare.mjs && npx tsx ../api/src/server.ts',
      url: `${E2E.api}/health`,
      env: {
        NODE_ENV: 'development',
        PORT: '4100',
        LOG_LEVEL: 'warn',
        DATABASE_URL: E2E.database,
        CORS_ORIGINS: `${E2E.web},${E2E.admin}`,
        ADMIN_ORIGIN: E2E.admin,
        SITE_URL: E2E.web,
        API_PUBLIC_URL: E2E.api,
        AUTH_URL: E2E.auth,
        EMAIL_PROVIDER: 'file',
        OUTBOX_DIR: '../../.data/e2e-outbox',
        MEDIA_DIR: '../../.data/e2e-media',
        DOCUMENTS_DIR: '../../.data/e2e-documents',
        RATE_LIMIT_SCALE: '20',
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx next build && npx next start --port 3100',
      url: E2E.web,
      env: {
        NEXT_DIST_DIR: '.next-e2e',
        SITE_URL: E2E.web,
        API_URL: E2E.api,
        NEXT_PUBLIC_API_URL: E2E.api,
        NEXT_TELEMETRY_DISABLED: '1',
      },
      reuseExistingServer: false,
      timeout: 240_000,
    },
    {
      command:
        'npx vite build --outDir dist-e2e && npx vite preview --port 5174 --strictPort --outDir dist-e2e',
      cwd: '../admin',
      url: E2E.admin,
      env: { VITE_API_URL: E2E.api },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
