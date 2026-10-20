import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAKE_OPENROUTER_ORIGIN, FAKE_OPENROUTER_PORT } from './e2e/fake-openrouter-origin';
import { E2E_TIME_ZONE } from './e2e/time-zone';
import {
  BUILD_AND_START_COMMAND,
  FAKE_OPENROUTER_COMMAND,
  FAKE_OPENROUTER_HEALTH_PATH,
  localOrigin,
  SERVER_HEALTH_PATH,
  stackEnvironment,
} from './e2e/stack';

const PORT = 3100;
const ORIGIN = localOrigin(PORT);
const SERVER_START_TIMEOUT_MS = 300_000;
const TEST_TIMEOUT_MS = 120_000;
const CONTINUOUS_INTEGRATION_WORKERS = 4;
const LOCAL_WORKERS = CONTINUOUS_INTEGRATION_WORKERS;
const HEAVY_PROJECT_WORKERS = 1;
const IGNORED_SPECS = ['**/_*'];
const HEAVY_SPECS = [
  '**/backpressure.spec.ts',
  '**/device-first.spec.ts',
  '**/local-preview.spec.ts',
  '**/open-progress.spec.ts',
  '**/room-admission.spec.ts',
];

if (!process.env.E2E_DATABASE_DIR) process.env.E2E_DATABASE_DIR = mkdtempSync(join(tmpdir(), 'superdoc-collab-e2e-'));
const DATABASE_DIR = process.env.E2E_DATABASE_DIR;

export default defineConfig({
  testDir: 'e2e',
  testIgnore: IGNORED_SPECS,
  timeout: TEST_TIMEOUT_MS,
  workers: process.env.CI ? CONTINUOUS_INTEGRATION_WORKERS : LOCAL_WORKERS,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: ORIGIN, trace: 'retain-on-failure', timezoneId: E2E_TIME_ZONE },
  projects: [
    { name: 'chromium', testIgnore: [...IGNORED_SPECS, ...HEAVY_SPECS], use: { ...devices['Desktop Chrome'] } },
    // NB ADR 0048: the server converts one heavy document at a time per lane, so the specs that upload one run one at a time.
    { name: 'heavy', testMatch: HEAVY_SPECS, workers: HEAVY_PROJECT_WORKERS, use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: FAKE_OPENROUTER_COMMAND,
      url: `${FAKE_OPENROUTER_ORIGIN}${FAKE_OPENROUTER_HEALTH_PATH}`,
      reuseExistingServer: false,
      env: { FAKE_OPENROUTER_PORT: String(FAKE_OPENROUTER_PORT) },
    },
    {
      command: BUILD_AND_START_COMMAND,
      url: `${ORIGIN}${SERVER_HEALTH_PATH}`,
      reuseExistingServer: false,
      timeout: SERVER_START_TIMEOUT_MS,
      env: stackEnvironment({ port: PORT, databaseDir: DATABASE_DIR, fakeOpenRouterOrigin: FAKE_OPENROUTER_ORIGIN }),
    },
  ],
});
