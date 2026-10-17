import { defineConfig } from 'vitest/config';

const MAX_PARALLEL_FILES = 4;
const INTEGRATION_TEST_TIMEOUT_MS = 20_000;

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    maxWorkers: MAX_PARALLEL_FILES,
    testTimeout: INTEGRATION_TEST_TIMEOUT_MS,
  },
});
