import { serve, type ServerType } from '@hono/node-server';
import type { Hocuspocus } from '@hocuspocus/server';
import type { Hono } from 'hono';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MigrationSet, ReadModel, UpdateLog } from '@superdoc-history/history';
import { ApiPath, HttpStatus } from '@superdoc-history/types';
import { createAuth, type Auth } from './auth/auth';
import { attachCollaboration } from './collaboration/attach-collaboration';
import { createCollaborationRuntime, type DocumentRuntime } from './collaboration/collaboration-runtime';
import { createCollaborationServer } from './collaboration/collaboration-server';
import type { Environment } from './config/environment';
import { join } from 'node:path';
import { AUTH_DATABASE_FILE, DOCUMENT_FILES_DIRECTORY, ensureWritableDirectory, HISTORY_DATABASE_FILE, openDatabase, openSqliteFile, READ_MODEL_DATABASE_FILE, type AuthDatabase } from './database/connection';
import { runHistoryMigrations, runMigrations } from './database/migrate';
import { DocumentsRepository } from './documents/documents-repository';
import type { DocumentFileStorage } from './documents/file-storage';
import { createLocalDiskFileStorage } from './documents/local-disk-file-storage';
import { createApp } from './http/app';
import { findDocumentsToProject } from './history/pending-documents';
import { ShareLinksRepository } from './documents/share-links';
import { ProjectionScheduler } from './history/projection-scheduler';
import { mountStaticWeb } from './http/static-web';

export const NOT_FOUND_MESSAGE = 'Not found';

export type ServerServices = { documents: DocumentsRepository; storage: DocumentFileStorage; log: UpdateLog; hocuspocus: Hocuspocus; readModel: ReadModel; scheduler: ProjectionScheduler; runtime: DocumentRuntime; shareLinks: ShareLinksRepository };

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
  const documentFilesDirectory = join(environment.databaseDirectory, DOCUMENT_FILES_DIRECTORY);
  ensureWritableDirectory(environment.databaseDirectory);
  ensureWritableDirectory(documentFilesDirectory);
  const database = openDatabase({ directory: environment.databaseDirectory, fileName: AUTH_DATABASE_FILE });
  runMigrations(database);
  const historySqlite = openSqliteFile({ directory: environment.databaseDirectory, fileName: HISTORY_DATABASE_FILE });
  runHistoryMigrations({ sqlite: historySqlite, set: MigrationSet.History });
  const readModelSqlite = openSqliteFile({ directory: environment.databaseDirectory, fileName: READ_MODEL_DATABASE_FILE });
  runHistoryMigrations({ sqlite: readModelSqlite, set: MigrationSet.ReadModel });
  const documents = new DocumentsRepository(database);
  const log = new UpdateLog(historySqlite);
  const readModel = new ReadModel(readModelSqlite);
  const scheduler = new ProjectionScheduler({ databaseDirectory: environment.databaseDirectory });
  const auth = createAuth({ database, environment });
  findDocumentsToProject({ historySqlite, readModelSqlite }).forEach((documentId) => scheduler.schedule(documentId));
  const hocuspocus = createCollaborationServer({ auth, documents, log, onStored: (documentId) => {
      documents.touch(documentId);
      scheduler.schedule(documentId);
    },
  });
  const storage = createLocalDiskFileStorage(documentFilesDirectory);
  const runtime = createCollaborationRuntime({ hocuspocus, log, readModel, scheduler, storage });
  const shareLinks = new ShareLinksRepository({ database, secret: environment.authSecret, appOrigin: environment.appOrigin });
  const services: ServerServices = { documents, storage, log, hocuspocus, readModel, scheduler, runtime, shareLinks };
  const app = createApp({ auth, environment, services });
  if (webDistDirectory) mountStaticWeb({ app, webDistDirectory });
  app.notFound((context) => context.json({ error: NOT_FOUND_MESSAGE }, HttpStatus.NotFound));
  const httpServer = await listen({ app, port: environment.port });
  const { port } = httpServer.address() as AddressInfo;
  const sockets = attachCollaboration({ httpServer: httpServer as Server, hocuspocus, path: ApiPath.Collaboration, allowedOrigin: environment.appOrigin });
  return {
    httpServer,
    port,
    auth,
    database,
    services,
    stop: async () => {
      await hocuspocus.destroy();
      await scheduler.stop();
      sockets.clients.forEach((client) => client.terminate());
      sockets.close();
      closeAllConnectionsWhenSupported(httpServer);
      await closeServer(httpServer);
      database.sqlite.close();
      historySqlite.close();
      readModelSqlite.close();
    },
  };
}
