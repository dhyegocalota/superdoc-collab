import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 600_000,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', video: process.env.SPIKE_VIDEO === 'on' ? 'on' : 'retain-on-failure' },
  webServer: {
    command: 'pnpm exec vite build && pnpm exec vite preview',
    url: 'http://127.0.0.1:5198',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
