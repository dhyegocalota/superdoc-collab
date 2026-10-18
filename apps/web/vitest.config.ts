import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { SECOND_MS } from '../../libs/types/src/constants';

const TEST_TIMEOUT_MS = 15 * SECOND_MS;

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    testTimeout: TEST_TIMEOUT_MS,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/testing/setup.ts'],
  },
});
