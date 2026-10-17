import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAKE_OPENROUTER_ORIGIN, FAKE_OPENROUTER_PORT } from './e2e/fake-openrouter-origin';
import { BUILD_AND_START_COMMAND, localOrigin, stackEnvironment } from './e2e/stack';

const PORT = 3100;
const ORIGIN = localOrigin(PORT);
const SERVER_START_TIMEOUT_MS = 300_000;
const TEST_TIMEOUT_MS = 120_000;
const CONTINUOUS_INTEGRATION_WORKERS = 4;
const LOCAL_WORKERS = '50%';

if (!process.env.E2E_DATABASE_DIR) process.env.E2E_DATABASE_DIR = mkdtempSync(join(tmpdir(), 'superdoc-history-e2e-'));
const DATABASE_DIR = process.env.E2E_DATABASE_DIR;

export default defineConfig({
  testDir: 'e2e',
  timeout: TEST_TIMEOUT_MS,
  workers: process.env.CI ? CONTINUOUS_INTEGRATION_WORKERS : LOCAL_WORKERS,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: ORIGIN, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/fake-openrouter.ts',
      url: `${FAKE_OPENROUTER_ORIGIN}/health`,
      reuseExistingServer: false,
      env: { FAKE_OPENROUTER_PORT: String(FAKE_OPENROUTER_PORT) },
    },
    {
      command: BUILD_AND_START_COMMAND,
      url: `${ORIGIN}/api/health`,
      reuseExistingServer: false,
      timeout: SERVER_START_TIMEOUT_MS,
      env: stackEnvironment({ port: PORT, databaseDir: DATABASE_DIR, fakeOpenRouterOrigin: FAKE_OPENROUTER_ORIGIN }),
    },
  ],
});
