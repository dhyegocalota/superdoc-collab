import { serve, type ServerType } from '@hono/node-server';
import type { Hono } from 'hono';
import type { AddressInfo } from 'node:net';
import { createAuth, type Auth } from './auth/auth';
import type { Environment } from './config/environment';
import { AUTH_DATABASE_FILE, openDatabase, type AuthDatabase } from './database/connection';
import { runMigrations } from './database/migrate';
import { createApp } from './http/app';
import { mountStaticWeb } from './http/static-web';

const NOT_FOUND_MESSAGE = 'Not found';
const NOT_FOUND_STATUS = 404;

export type RunningServer = { httpServer: ServerType; port: number; auth: Auth; database: AuthDatabase; stop: () => Promise<void> };

export function closeAllConnectionsWhenSupported(httpServer: ServerType): void {
  if (!('closeAllConnections' in httpServer)) return;
  httpServer.closeAllConnections();
}

export function closeServer(httpServer: ServerType): Promise<void> {
  return new Promise((resolve, reject) => httpServer.close((error) => (error ? reject(error) : resolve())));
}

function listen({ app, port }: { app: Hono; port: number }): Promise<ServerType> {
  return new Promise((resolve) => {
    const started = serve({ fetch: app.fetch, port }, () => resolve(started));
  });
}

export async function startServer({ environment, webDistDirectory }: { environment: Environment; webDistDirectory: string | null }): Promise<RunningServer> {
  const database = openDatabase({ directory: environment.databaseDirectory, fileName: AUTH_DATABASE_FILE });
  runMigrations(database);
  const auth = createAuth({ database, environment });
  const app = createApp({ auth, environment });
  if (webDistDirectory) mountStaticWeb({ app, webDistDirectory });
  app.notFound((context) => context.json({ error: NOT_FOUND_MESSAGE }, NOT_FOUND_STATUS));
  const httpServer = await listen({ app, port: environment.port });
  const { port } = httpServer.address() as AddressInfo;
  return {
    httpServer,
    port,
    auth,
    database,
    stop: async () => {
      closeAllConnectionsWhenSupported(httpServer);
      await closeServer(httpServer);
      database.sqlite.close();
    },
  };
}
