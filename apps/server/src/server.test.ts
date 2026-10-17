import { ApiPath, AppRoute } from '@superdoc-history/types';
import { createServer, type AddressInfo } from 'node:net';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { DOCUMENT_FILES_DIRECTORY, DatabaseDirectoryNotWritableError } from './database/connection';
import { JobOutcome } from './insights/insights-job-runner';
import { startServer } from './server';
import { testEnvironment } from './testing/test-server';

const RESTART_CREDENTIALS = { name: 'Eva', email: 'eva@example.com', password: 'superdoc-demo' };

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

  test('a session cookie survives a restart on the same database directory', async () => {
    const environment = testEnvironment();
    const first = await startServer({ environment, webDistDirectory: null });
    const headers = { 'content-type': 'application/json' };
    await fetch(urlOf({ port: first.port, path: `${ApiPath.Auth}/sign-up/email` }), {
      method: 'POST',
      headers,
      body: JSON.stringify(RESTART_CREDENTIALS),
    });
    const signedIn = await fetch(urlOf({ port: first.port, path: `${ApiPath.Auth}/sign-in/email` }), {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: RESTART_CREDENTIALS.email, password: RESTART_CREDENTIALS.password }),
    });
    const cookie = signedIn.headers
      .getSetCookie()
      .map((setCookie) => setCookie.split(';')[0])
      .join('; ');
    await first.stop();
    const second = await startServer({ environment, webDistDirectory: null });
    const me = await fetch(urlOf({ port: second.port, path: ApiPath.Me }), { headers: { cookie } });
    await second.stop();
    expect(await me.json()).toEqual({ user: { id: expect.any(String), name: RESTART_CREDENTIALS.name, email: RESTART_CREDENTIALS.email } });
  });
  test('fails with a named error when the documents directory is not writable', async () => {
    const environment = testEnvironment();
    const documentsDirectory = join(environment.databaseDirectory, DOCUMENT_FILES_DIRECTORY);
    mkdirSync(documentsDirectory);
    chmodSync(documentsDirectory, 0o500);
    await expect(startServer({ environment, webDistDirectory: null })).rejects.toThrow(DatabaseDirectoryNotWritableError);
  });
});

test('startServer rejects instead of hanging when the port is taken', async () => {
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, resolve));
  const { port } = blocker.address() as AddressInfo;
  await expect(startServer({ environment: { ...testEnvironment(), port }, webDistDirectory: null })).rejects.toMatchObject({
    code: 'EADDRINUSE',
  });
  await new Promise((resolve) => blocker.close(resolve));
});

test('startServer hands the configured LLM limits to the insights worker', async () => {
  const environment = { ...testEnvironment(), llm: { model: null, apiKey: null, baseUrl: null, maxConcurrentJobs: 1, maxCallsPerHour: 1 } };
  const running = await startServer({ environment, webDistDirectory: null });
  const { jobRunner } = running.services.insights;
  expect(jobRunner.run({ key: 'held', job: () => new Promise<void>((resolve) => setTimeout(resolve, 50)) })).toBe(JobOutcome.Started);
  expect(jobRunner.run({ key: 'other', job: async () => undefined })).toBe(JobOutcome.Busy);
  expect([jobRunner.consumeCall(), jobRunner.consumeCall()]).toEqual([true, false]);
  await running.stop();
});
