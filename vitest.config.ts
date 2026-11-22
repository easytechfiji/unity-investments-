import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'packages/*/test/**/*.test.ts',
            'apps/api/test/*.test.ts',
            'supabase/tests/**/*.test.ts',
          ],
          environment: 'node',
        },
      },
      {
        // Real Postgres (npm run db:start locally, a service container in CI).
        // Files run one at a time because they share the od_test database.
        test: {
          name: 'integration',
          include: ['apps/api/test/integration/**/*.test.ts'],
          globalSetup: ['apps/api/test/integration/globalSetup.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
