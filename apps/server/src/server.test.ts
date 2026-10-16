import { ApiPath, AppRoute } from '@superdoc-history/types';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { startServer } from './server';
import { testEnvironment } from './testing/test-server';

function createWebDistDirectory(): string {
  const webDistDirectory = mkdtempSync(join(tmpdir(), 'web-dist-'));
  writeFileSync(join(webDistDirectory, 'index.html'), '<html><body>app</body></html>');
  writeFileSync(join(webDistDirectory, 'asset.txt'), 'static asset');
  return webDistDirectory;
}

function urlOf({ port, path }: { port: number; path: string }): string {
  return `http://127.0.0.1:${port}${path}`;
}

describe('startServer', () => {
  test('serves the SPA fallback for an app route when the web directory is set', async () => {
    const running = await startServer({ environment: testEnvironment(), webDistDirectory: createWebDistDirectory() });
    const response = await fetch(urlOf({ port: running.port, path: AppRoute.Documents }));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('app');
    await running.stop();
  });

  test('serves static files from the web directory', async () => {
    const running = await startServer({ environment: testEnvironment(), webDistDirectory: createWebDistDirectory() });
    const response = await fetch(urlOf({ port: running.port, path: '/asset.txt' }));
    expect(await response.text()).toBe('static asset');
    await running.stop();
  });

  test('api 404 is json, not the SPA, when the web directory is set', async () => {
    const running = await startServer({ environment: testEnvironment(), webDistDirectory: createWebDistDirectory() });
    const response = await fetch(urlOf({ port: running.port, path: '/api/missing' }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
    await running.stop();
  });

  test('api 404 is json without a web directory', async () => {
    const running = await startServer({ environment: testEnvironment(), webDistDirectory: null });
    const response = await fetch(urlOf({ port: running.port, path: '/api/missing' }));
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('json');
    await running.stop();
  });

  test('still answers the health endpoint with the web directory mounted', async () => {
    const running = await startServer({ environment: testEnvironment(), webDistDirectory: createWebDistDirectory() });
    const response = await fetch(urlOf({ port: running.port, path: ApiPath.Health }));
    expect(await response.json()).toEqual({ status: 'ok' });
    await running.stop();
  });
});
