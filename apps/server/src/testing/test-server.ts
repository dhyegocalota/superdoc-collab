import { ApiPath, type SessionUser } from '@superdoc-history/types';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Auth } from '../auth/auth';
import type { Environment } from '../config/environment';
import type { AuthDatabase } from '../database/connection';
import { startServer, type ServerServices } from '../server';

const TEST_AUTH_SECRET = 'test-secret-'.padEnd(32, 'x');
const LOOPBACK_HOST = '127.0.0.1';
const UNIQUE_EMAIL_SUFFIX_LENGTH = 8;
const OWNER_NAME = 'Ana';
export const TEST_USER_PASSWORD = 'superdoc-demo';

export type TestServer = { baseUrl: string; auth: Auth; database: AuthDatabase; services: ServerServices; databaseDirectory: string; stop: () => Promise<void> };

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

export async function startTestServer({ trustProxy = true, databaseDirectory = mkdtempSync(join(tmpdir(), 'superdoc-history-')) }: { trustProxy?: boolean; databaseDirectory?: string } = {}): Promise<TestServer> {
  const port = await reserveFreePort();
  const environment: Environment = { port, appOrigin: `http://${LOOPBACK_HOST}:${port}`, authSecret: TEST_AUTH_SECRET, databaseDirectory, trustProxy };
  const running = await startServer({ environment, webDistDirectory: null });
  return { baseUrl: environment.appOrigin, auth: running.auth, database: running.database, services: running.services, databaseDirectory, stop: running.stop };
}

let nextClientAddress = 0;

async function postCredentials({ server, path, body }: { server: TestServer; path: string; body: Record<string, string> }): Promise<Response> {
  const clientAddress = `10.200.0.${nextClientAddress++}`;
  return fetch(`${server.baseUrl}${ApiPath.Auth}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': clientAddress }, body: JSON.stringify(body) });
}

export class TestSignInFailedError extends Error {
  constructor({ step, status }: { step: string; status: number }) {
    super(`Test sign-in failed at ${step} with status ${status}.`);
  }
}

export async function signInExisting({ server, email, password }: { server: TestServer; email: string; password: string }): Promise<string> {
  const signedIn = await postCredentials({ server, path: '/sign-in/email', body: { email, password } });
  if (!signedIn.ok) throw new TestSignInFailedError({ step: 'sign-in', status: signedIn.status });
  const cookie = signedIn.headers.getSetCookie().map((setCookie) => setCookie.split(';')[0]).join('; ');
  if (!cookie) throw new TestSignInFailedError({ step: 'cookie', status: signedIn.status });
  return cookie;
}

export async function signInAndGetCookie({ server, credentials }: { server: TestServer; credentials: { name: string; email: string; password: string } }): Promise<string> {
  const signedUp = await postCredentials({ server, path: '/sign-up/email', body: credentials });
  if (!signedUp.ok) throw new TestSignInFailedError({ step: 'sign-up', status: signedUp.status });
  return signInExisting({ server, email: credentials.email, password: credentials.password });
}

export async function currentUserId({ server, cookie }: { server: TestServer; cookie: string }): Promise<string> {
  const response = await fetch(`${server.baseUrl}${ApiPath.Me}`, { headers: { cookie } });
  const { user } = (await response.json()) as { user: SessionUser | null };
  if (!user) throw new TestSignInFailedError({ step: 'me', status: response.status });
  return user.id;
}

export type TestUser = { id: string; email: string; cookie: string };

export async function signedInUser({ server, name }: { server: TestServer; name: string }): Promise<TestUser> {
  const email = `${name.toLowerCase()}-${randomUUID().slice(0, UNIQUE_EMAIL_SUFFIX_LENGTH)}@example.com`;
  const cookie = await signInAndGetCookie({ server, credentials: { name, email, password: TEST_USER_PASSWORD } });
  return { id: await currentUserId({ server, cookie }), email, cookie };
}

export async function signedInOwner(): Promise<{ server: TestServer; owner: TestUser }> {
  const server = await startTestServer();
  return { server, owner: await signedInUser({ server, name: OWNER_NAME }) };
}
