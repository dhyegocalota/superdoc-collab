import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 600_000,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm exec vite build && pnpm exec vite preview',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
