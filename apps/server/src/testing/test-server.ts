import { serve, type ServerType } from '@hono/node-server';
import { mkdtempSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuth, type Auth } from '../auth/auth';
import type { Environment } from '../config/environment';
import { AUTH_DATABASE_FILE, openDatabase, type AuthDatabase } from '../database/connection';
import { runMigrations } from '../database/migrate';
import { createApp } from '../http/app';

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

function closeIdleConnections(httpServer: ServerType): void {
  if (!('closeAllConnections' in httpServer)) return;
  httpServer.closeAllConnections();
}

function closeServer(httpServer: ServerType): Promise<void> {
  return new Promise((resolve, reject) => httpServer.close((error) => (error ? reject(error) : resolve())));
}

export async function startTestServer(): Promise<TestServer> {
  const database = openDatabase({ directory: mkdtempSync(join(tmpdir(), 'superdoc-history-')), fileName: AUTH_DATABASE_FILE });
  runMigrations(database);
  const port = await reserveFreePort();
  const environment: Environment = { port, appOrigin: `http://${LOOPBACK_HOST}:${port}`, authSecret: TEST_AUTH_SECRET, databaseDirectory: '' };
  const auth = createAuth({ database, environment });
  const app = createApp({ auth });
  const httpServer = await new Promise<ServerType>((resolve) => {
    const started = serve({ fetch: app.fetch, port, hostname: LOOPBACK_HOST }, () => resolve(started));
  });
  return {
    baseUrl: environment.appOrigin,
    auth,
    database,
    stop: async () => {
      closeIdleConnections(httpServer);
      await closeServer(httpServer);
      database.sqlite.close();
    },
  };
}
