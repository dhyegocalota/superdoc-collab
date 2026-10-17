import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAKE_OPENROUTER_ORIGIN, FAKE_OPENROUTER_PORT } from './e2e/fake-openrouter-origin';

const PORT = 3100;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SERVER_START_TIMEOUT_MS = 300_000;
const TEST_TIMEOUT_MS = 120_000;
const LLM_MAX_CONCURRENT_JOBS = 2;
const LLM_MAX_CALLS_PER_HOUR = 10_000;
const TEST_AUTH_SECRET = 'e2e-auth-secret-with-at-least-32-characters';
const BUILD_AND_START_COMMAND = [
  'pnpm --filter @superdoc-history/web build',
  'pnpm --filter @superdoc-history/server build',
  'node apps/server/dist/seed.js',
  'node apps/server/dist/main.js',
].join(' && ');

if (!process.env.E2E_DATABASE_DIR) process.env.E2E_DATABASE_DIR = mkdtempSync(join(tmpdir(), 'superdoc-history-e2e-'));
const DATABASE_DIR = process.env.E2E_DATABASE_DIR;

export default defineConfig({
  testDir: 'e2e',
  timeout: TEST_TIMEOUT_MS,
  workers: 1,
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
      env: {
        PORT: String(PORT),
        APP_ORIGIN: ORIGIN,
        AUTH_SECRET: TEST_AUTH_SECRET,
        DATABASE_DIR,
        TRUST_PROXY: 'true',
        DEMO_PASSWORD: 'superdoc-demo',
        WEB_DIST_DIR: 'apps/web/dist',
        LLM_MODEL: 'openai/gpt-6-luna',
        OPENROUTER_API_KEY: 'e2e-fake-key',
        OPENROUTER_BASE_URL: `${FAKE_OPENROUTER_ORIGIN}/api/v1`,
        LLM_MAX_CONCURRENT_JOBS: String(LLM_MAX_CONCURRENT_JOBS),
        LLM_MAX_CALLS_PER_HOUR: String(LLM_MAX_CALLS_PER_HOUR),
      },
    },
  ],
});
