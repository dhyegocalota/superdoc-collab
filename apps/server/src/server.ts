import { serve, type ServerType } from '@hono/node-server';
import type { Hono } from 'hono';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ApiPath, HttpStatus } from '@superdoc-history/types';
import { createAuth, type Auth } from './auth/auth';
import { attachCollaboration } from './collaboration/attach-collaboration';
import { createCollaborationServer } from './collaboration/collaboration-server';
import type { Environment } from './config/environment';
import { join } from 'node:path';
import { AUTH_DATABASE_FILE, DOCUMENT_FILES_DIRECTORY, openDatabase, type AuthDatabase } from './database/connection';
import { runMigrations } from './database/migrate';
import { DocumentsRepository } from './documents/documents-repository';
import type { DocumentFileStorage } from './documents/file-storage';
import { createLocalDiskFileStorage } from './documents/local-disk-file-storage';
import { createApp } from './http/app';
import { mountStaticWeb } from './http/static-web';

const NOT_FOUND_MESSAGE = 'Not found';

export type ServerServices = { documents: DocumentsRepository; storage: DocumentFileStorage };

export type RunningServer = { httpServer: ServerType; port: number; auth: Auth; database: AuthDatabase; services: ServerServices; stop: () => Promise<void> };

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
  const services: ServerServices = {
    documents: new DocumentsRepository(database),
    storage: createLocalDiskFileStorage(join(environment.databaseDirectory, DOCUMENT_FILES_DIRECTORY)),
  };
  const auth = createAuth({ database, environment });
  const app = createApp({ auth, environment });
  if (webDistDirectory) mountStaticWeb({ app, webDistDirectory });
  app.notFound((context) => context.json({ error: NOT_FOUND_MESSAGE }, HttpStatus.NotFound));
  const httpServer = await listen({ app, port: environment.port });
  const { port } = httpServer.address() as AddressInfo;
  const hocuspocus = createCollaborationServer({ auth });
  const sockets = attachCollaboration({ httpServer: httpServer as Server, hocuspocus, path: ApiPath.Collaboration, allowedOrigin: environment.appOrigin });
  return {
    httpServer,
    port,
    auth,
    database,
    services,
    stop: async () => {
      await hocuspocus.destroy();
      sockets.clients.forEach((client) => client.terminate());
      sockets.close();
      closeAllConnectionsWhenSupported(httpServer);
      await closeServer(httpServer);
      database.sqlite.close();
    },
  };
}
