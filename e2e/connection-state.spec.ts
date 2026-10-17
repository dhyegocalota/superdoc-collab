import { startRestartableStack, startServer, stopRestartableStack, stopServer } from './restartable-stack';
import { expect, test } from './fixtures';
import { SERVER_HEALTH_PATH } from './stack';

test.describe.configure({ mode: 'serial' });

let origin: string;

test.beforeAll(async () => {
  origin = await startRestartableStack();
});

test.afterAll(async () => {
  await stopRestartableStack();
});

test('the restartable server answers health after a stop and a start', async () => {
  await stopServer();
  await startServer();
  const response = await fetch(`${origin}${SERVER_HEALTH_PATH}`);
  expect(response.status).toBe(200);
});
