import { serve, type ServerType } from '@hono/node-server';
import type { Hocuspocus } from '@hocuspocus/server';
import type { Hono } from 'hono';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MigrationSet, ReadModel, UpdateLog } from '@superdoc-history/history';
import { ApiPath, HttpStatus, TOPICS_INTERRUPTED_MESSAGE } from '@superdoc-history/types';
import { createAuth, type Auth } from './auth/auth';
import { attachCollaboration } from './collaboration/attach-collaboration';
import { createCollaborationRuntime } from './collaboration/collaboration-runtime';
import { createCollaborationServer } from './collaboration/collaboration-server';
import type { Environment } from './config/environment';
import { join } from 'node:path';
import {
  AUTH_DATABASE_FILE,
  DOCUMENT_FILES_DIRECTORY,
  ensureWritableDirectory,
  HISTORY_DATABASE_FILE,
  openDatabase,
  openSqliteFile,
  READ_MODEL_DATABASE_FILE,
  type AuthDatabase,
} from './database/connection';
import { runHistoryMigrations, runMigrations } from './database/migrate';
import { DocumentsRepository } from './documents/documents-repository';
import { createLocalDiskFileStorage } from './documents/local-disk-file-storage';
import { VersionsService } from './history/versions-service';
import { DEFAULT_VERSION_ROOM_POLICY, VersionRooms, type VersionRoomPolicy } from './collaboration/version-rooms';
import { createApp, NOT_FOUND_MESSAGE, type AppServices, type InsightsServices } from './http/app';
import { findDocumentsToProject, findDocumentsWithoutMarks } from './history/pending-documents';
import { ShareLinksRepository } from './documents/share-links';
import { InsightsJobRunner } from './insights/insights-job-runner';
import { SelectionSummariesService } from './insights/selection-summaries-service';
import { SummariesService } from './insights/summaries-service';
import { TopicsService } from './insights/topics-service';
import { buildSelectionSnapshot, readTimelinePipeline } from './history/timeline-service';
import { InsightsRepository } from './insights/insights-repository';
import { chooseLanguageModel, type LanguageModelChoice } from './insights/llm-client';
import { ProjectionScheduler } from './history/projection-scheduler';
import { TimelinePipelineCache } from './history/timeline-pipeline-cache';
import { PROJECTION_THROTTLE_MS, ProjectionThrottle } from './history/projection-throttle';
import { mountStaticWeb } from './http/static-web';

export type ServerServices = AppServices & { hocuspocus: Hocuspocus; throttle: ProjectionThrottle };

export type RunningServer = {
  httpServer: ServerType;
  port: number;
  auth: Auth;
  database: AuthDatabase;
  services: ServerServices;
  stop: () => Promise<void>;
};

export function closeAllConnectionsWhenSupported(httpServer: ServerType): void {
  if (!('closeAllConnections' in httpServer)) return;
  httpServer.closeAllConnections();
}

export function closeServer(httpServer: ServerType): Promise<void> {
  return new Promise((resolve, reject) => httpServer.close((error) => (error ? reject(error) : resolve())));
}

function listen({ app, port }: { app: Hono; port: number }): Promise<ServerType> {
  return new Promise((resolve, reject) => {
    const started = serve({ fetch: app.fetch, port }, () => resolve(started));
    started.once('error', reject);
  });
}

export async function startServer({
  environment,
  webDistDirectory,
  languageModel = chooseLanguageModel(environment.llm),
  versionRoomPolicy = DEFAULT_VERSION_ROOM_POLICY,
}: {
  environment: Environment;
  webDistDirectory: string | null;
  languageModel?: LanguageModelChoice;
  versionRoomPolicy?: VersionRoomPolicy;
}): Promise<RunningServer> {
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
  const insightsRepository = new InsightsRepository(database);
  insightsRepository.failInterrupted(TOPICS_INTERRUPTED_MESSAGE);
  const updateLog = new UpdateLog(historySqlite);
  const readModel = new ReadModel(readModelSqlite);
  const scheduler = new ProjectionScheduler({ databaseDirectory: environment.databaseDirectory });
  const auth = createAuth({ database, environment });
  const versions = new VersionsService({ readModel, scheduler });
  const versionRooms = new VersionRooms({ auth, documents, versions, policy: versionRoomPolicy });
  findDocumentsToProject({ historySqlite, readModelSqlite }).forEach((documentId) => scheduler.schedule(documentId));
  const throttle = new ProjectionThrottle({ intervalMs: PROJECTION_THROTTLE_MS, run: (documentId) => scheduler.schedule(documentId) });
  const hocuspocus = createCollaborationServer({
    auth,
    documents,
    updateLog,
    onLogged: (documentId) => throttle.request(documentId),
    onStored: (documentId) => {
      documents.touch(documentId);
      scheduler.schedule(documentId);
    },
  });
  const timelinePipelines = new TimelinePipelineCache();
  const storage = createLocalDiskFileStorage(documentFilesDirectory);
  findDocumentsWithoutMarks(readModelSqlite).forEach(
    (documentId) => void scheduler.rebuild({ documentId, filePath: storage.pathOf(documentId) }),
  );
  const runtime = createCollaborationRuntime({
    hocuspocus,
    updateLog,
    readModel,
    scheduler,
    storage,
    timelinePipelines,
    versions,
    versionRooms,
  });
  const shareLinks = new ShareLinksRepository({ database, secret: environment.authSecret, appOrigin: environment.appOrigin });
  const jobRunner = new InsightsJobRunner({
    maxConcurrentJobs: environment.llm.maxConcurrentJobs,
    maxCallsPerHour: environment.llm.maxCallsPerHour,
  });
  const insights: InsightsServices = {
    jobRunner,
    topics: new TopicsService({
      repository: insightsRepository,
      scheduler,
      languageModel,
      jobRunner,
      readPipeline: (documentId) => readTimelinePipeline({ services, documentId }),
    }),
    summaries: new SummariesService({
      repository: insightsRepository,
      languageModel,
      jobRunner,
      readPipeline: (documentId) => readTimelinePipeline({ services, documentId }),
    }),
    selection: new SelectionSummariesService({
      repository: insightsRepository,
      languageModel,
      jobRunner,
      readSelection: ({ documentId, selection }) => buildSelectionSnapshot({ services, documentId, selection }),
    }),
  };
  const services: ServerServices = {
    documents,
    storage,
    updateLog,
    hocuspocus,
    readModel,
    scheduler,
    runtime,
    shareLinks,
    insightsRepository,
    throttle,
    timelinePipelines,
    insights,
    versions,
    versionRooms,
  };
  const app = createApp({ auth, environment, services });
  if (webDistDirectory) mountStaticWeb({ app, webDistDirectory });
  app.notFound((context) => context.json({ error: NOT_FOUND_MESSAGE }, HttpStatus.NotFound));
  async function closeCollaboration(): Promise<void> {
    await versionRooms.stop();
    await hocuspocus.destroy();
    throttle.stop();
    await scheduler.stop();
    await jobRunner.idle();
  }
  function closeDatabases(): void {
    database.sqlite.close();
    historySqlite.close();
    readModelSqlite.close();
  }
  const httpServer = await listen({ app, port: environment.port }).catch(async (error) => {
    await closeCollaboration();
    closeDatabases();
    throw error;
  });
  const { port } = httpServer.address() as AddressInfo;
  const sockets = attachCollaboration({
    httpServer: httpServer as Server,
    hocuspocus,
    versionRooms,
    path: ApiPath.Collaboration,
    allowedOrigin: environment.appOrigin,
  });
  return {
    httpServer,
    port,
    auth,
    database,
    services,
    stop: async () => {
      await closeCollaboration();
      sockets.clients.forEach((client) => client.terminate());
      sockets.close();
      closeAllConnectionsWhenSupported(httpServer);
      await closeServer(httpServer);
      closeDatabases();
    },
  };
}
