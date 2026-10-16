import { ApiPath } from '@superdoc-history/types';
import { mkdtempSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Auth } from '../auth/auth';
import type { Environment } from '../config/environment';
import type { AuthDatabase } from '../database/connection';
import { startServer } from '../server';

const TEST_AUTH_SECRET = 'test-secret-'.padEnd(32, 'x');
const LOOPBACK_HOST = '127.0.0.1';

export type TestServer = { baseUrl: string; auth: Auth; database: AuthDatabase; stop: () => Promise<void> };

async function reserveFreePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, LOOPBACK_HOST, resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

export function testEnvironment({ databaseDirectory = mkdtempSync(join(tmpdir(), 'superdoc-history-')) }: { databaseDirectory?: string } = {}): Environment {
  return { port: 0, appOrigin: `http://${LOOPBACK_HOST}`, authSecret: TEST_AUTH_SECRET, databaseDirectory, trustProxy: true };
}

export async function startTestServer({ trustProxy = true }: { trustProxy?: boolean } = {}): Promise<TestServer> {
  const databaseDirectory = mkdtempSync(join(tmpdir(), 'superdoc-history-'));
  const port = await reserveFreePort();
  const environment: Environment = { port, appOrigin: `http://${LOOPBACK_HOST}:${port}`, authSecret: TEST_AUTH_SECRET, databaseDirectory, trustProxy };
  const running = await startServer({ environment, webDistDirectory: null });
  return { baseUrl: environment.appOrigin, auth: running.auth, database: running.database, stop: running.stop };
}

let nextClientAddress = 0;

async function postCredentials({ server, path, body }: { server: TestServer; path: string; body: Record<string, string> }): Promise<Response> {
  const clientAddress = `10.200.0.${nextClientAddress++}`;
  return fetch(`${server.baseUrl}${ApiPath.Auth}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': clientAddress }, body: JSON.stringify(body) });
}

export async function signInAndGetCookie({ server, credentials }: { server: TestServer; credentials: { name: string; email: string; password: string } }): Promise<string> {
  await postCredentials({ server, path: '/sign-up/email', body: credentials });
  const signedIn = await postCredentials({ server, path: '/sign-in/email', body: { email: credentials.email, password: credentials.password } });
  return signedIn.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}
