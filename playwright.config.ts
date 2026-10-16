import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 3100;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SERVER_START_TIMEOUT_MS = 300_000;
const TEST_AUTH_SECRET = 'e2e-auth-secret-with-at-least-32-characters';
const BUILD_AND_START_COMMAND = [
  'pnpm --filter @superdoc-history/web build',
  'pnpm --filter @superdoc-history/server build',
  'node apps/server/dist/seed.js',
  'node apps/server/dist/main.js',
].join(' && ');

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: ORIGIN, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: BUILD_AND_START_COMMAND,
    url: `${ORIGIN}/api/health`,
    reuseExistingServer: false,
    timeout: SERVER_START_TIMEOUT_MS,
    env: {
      PORT: String(PORT),
      APP_ORIGIN: ORIGIN,
      AUTH_SECRET: TEST_AUTH_SECRET,
      DATABASE_DIR: mkdtempSync(join(tmpdir(), 'superdoc-history-e2e-')),
      TRUST_PROXY: 'true',
      DEMO_PASSWORD: 'superdoc-demo',
      WEB_DIST_DIR: 'apps/web/dist',
    },
  },
});
