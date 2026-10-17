import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { PROJECTION_WORKER_FILE_VARIABLE } from './test-server';

const WORKER_FILE_EXTENSION = '.js';
const FILE_PROTOCOL = 'file:';

test('the Vitest run publishes a prebuilt projection worker that exists', () => {
  const published = process.env[PROJECTION_WORKER_FILE_VARIABLE];
  expect(published).toBeDefined();
  const workerFile = new URL(published as string);
  expect(workerFile.protocol).toBe(FILE_PROTOCOL);
  expect(workerFile.pathname.endsWith(WORKER_FILE_EXTENSION)).toBe(true);
  expect(existsSync(fileURLToPath(workerFile))).toBe(true);
});
