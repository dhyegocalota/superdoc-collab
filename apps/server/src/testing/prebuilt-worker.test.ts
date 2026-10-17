import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, vi } from 'vitest';
import { ApiPath, HttpStatus } from '@superdoc-collab/types';
import { PROJECTION_WORKER_FILE_VARIABLE } from './projection-worker-variable';
import { prebuiltProjectionWorkerFile, startTestServer } from './test-server';

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

test('without the variable no worker file is given and the tsx path still serves', async () => {
  vi.stubEnv(PROJECTION_WORKER_FILE_VARIABLE, '');
  expect(prebuiltProjectionWorkerFile()).toBeNull();
  const server = await startTestServer();
  const response = await fetch(`${server.baseUrl}${ApiPath.Health}`);
  expect(response.status).toBe(HttpStatus.Ok);
  await server.stop();
  vi.unstubAllEnvs();
});
