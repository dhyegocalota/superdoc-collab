import { serve, type ServerType } from '@hono/node-server';
import type { Hocuspocus } from '@hocuspocus/server';
import type { Hono } from 'hono';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type Database from 'better-sqlite3';
import type { WebSocketServer } from 'ws';
import { AgentActionsLog, MigrationSet, ReadModel, UpdateLog } from '@superdoc-collab/history';
import { ApiPath, CREATOR_RESERVATION_MS, HttpStatus, MINUTE_MS, SECOND_MS, TOPICS_INTERRUPTED_MESSAGE } from '@superdoc-collab/types';
import { OpenBudget } from './limits/open-budget';
import { agentRoomMode } from './agent/agent-room-mode';
import { createRoomModes } from './collaboration/room-modes';
import { createAgentToolkit } from '@superdoc/sdk';
import { InvitesRepository } from './admin/invites';
import { PasswordResetLinkCapture, PasswordResets } from './admin/password-reset-links';
import { AdminUsersRepository } from './admin/users';
import { AgentChangeMode } from './agent/agent-change-mode';
import { AgentSessions } from './agent/agent-sessions';
import { signRoomToken } from './agent/room-tokens';
import { createAuth, type Auth } from './auth/auth';
import { attachCollaboration } from './collaboration/attach-collaboration';
import { createCollaborationRuntime } from './collaboration/collaboration-runtime';
import { createCollaborationServer } from './collaboration/collaboration-server';
import { createBootstrapState } from './collaboration/bootstrap-state';
import { CreatorReservations } from './collaboration/creator-reservations';
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
import { SummarizeService } from './insights/summarize-service';
import { TopicsService } from './insights/topics-service';
import { buildSelectionSnapshot, readTimelinePipeline } from './history/timeline-service';
import { InsightsRepository } from './insights/insights-repository';
import { chooseLanguageModel, type LanguageModelChoice } from './insights/llm-client';
import { ProjectionScheduler } from './history/projection-scheduler';
import { TimelinePipelineCache } from './history/timeline-pipeline-cache';
import { PROJECTION_THROTTLE_MS, ProjectionThrottle } from './history/projection-throttle';
import { mountStaticWeb } from './http/static-web';

const AGENT_TOOLKIT_PROVIDER = 'vercel';
const AGENT_TOOLKIT_PRESET = 'core';
const LOOPBACK_WEBSOCKET_ORIGIN = 'ws://127.0.0.1';
const LOOPBACK_HTTP_ORIGIN = 'http://127.0.0.1';
export const KEEP_ALIVE_TIMEOUT_MS = 65 * SECOND_MS;
export const HEADERS_TIMEOUT_MS = KEEP_ALIVE_TIMEOUT_MS + SECOND_MS;

export type ServerServices = AppServices & { hocuspocus: Hocuspocus; throttle: ProjectionThrottle; reservations: CreatorReservations };

export type RunningServer = {
  httpServer: ServerType;
  port: number;
  host: string | null;
  auth: Auth;
  database: AuthDatabase;
  services: ServerServices;
  stop: () => Promise<void>;
};

function closeAllConnectionsWhenSupported(httpServer: ServerType): void {
  if (!('closeAllConnections' in httpServer)) return;
  httpServer.closeAllConnections();
}

function closeServer(httpServer: ServerType): Promise<void> {
  return new Promise((resolve, reject) => httpServer.close((error) => (error ? reject(error) : resolve())));
}

function listen({ app, port, host }: { app: Hono; port: number; host: string | null }): Promise<ServerType> {
  return new Promise((resolve, reject) => {
    const started = serve(
      {
        fetch: app.fetch,
        port,
        serverOptions: { keepAliveTimeout: KEEP_ALIVE_TIMEOUT_MS, headersTimeout: HEADERS_TIMEOUT_MS },
        ...(host === null ? {} : { hostname: host }),
      },
      () => resolve(started),
    );
    started.once('error', reject);
  });
}

type Databases = { database: AuthDatabase; historySqlite: Database.Database; readModelSqlite: Database.Database };

function openDatabases({
  databaseDirectory,
  documentFilesDirectory,
}: {
  databaseDirectory: string;
  documentFilesDirectory: string;
}): Databases {
  ensureWritableDirectory(databaseDirectory);
  ensureWritableDirectory(documentFilesDirectory);
  const database = openDatabase({ directory: databaseDirectory, fileName: AUTH_DATABASE_FILE });
  runMigrations(database);
  const historySqlite = openSqliteFile({ directory: databaseDirectory, fileName: HISTORY_DATABASE_FILE });
  runHistoryMigrations({ sqlite: historySqlite, set: MigrationSet.History });
  const readModelSqlite = openSqliteFile({ directory: databaseDirectory, fileName: READ_MODEL_DATABASE_FILE });
  runHistoryMigrations({ sqlite: readModelSqlite, set: MigrationSet.ReadModel });
  return { database, historySqlite, readModelSqlite };
}

function closeDatabases({ database, historySqlite, readModelSqlite }: Databases): void {
  database.sqlite.close();
  historySqlite.close();
  readModelSqlite.close();
}

function createInsights({
  insightsRepository,
  scheduler,
  languageModel,
  environment,
  currentServices,
}: {
  insightsRepository: InsightsRepository;
  scheduler: ProjectionScheduler;
  languageModel: LanguageModelChoice;
  environment: Environment;
  currentServices: () => ServerServices;
}): InsightsServices {
  const jobRunner = new InsightsJobRunner({
    maxConcurrentJobs: environment.llm.maxConcurrentJobs,
    maxCallsPerHour: environment.llm.maxCallsPerHour,
  });
  const topics = new TopicsService({
    repository: insightsRepository,
    scheduler,
    languageModel,
    jobRunner,
    readPipeline: (documentId) => readTimelinePipeline({ services: currentServices(), documentId }),
  });
  const summaries = new SummariesService({
    repository: insightsRepository,
    languageModel,
    jobRunner,
    readPipeline: (documentId) => readTimelinePipeline({ services: currentServices(), documentId }),
  });
  const selection = new SelectionSummariesService({
    repository: insightsRepository,
    languageModel,
    jobRunner,
    readSelection: ({ documentId, selection: requested }) =>
      buildSelectionSnapshot({ services: currentServices(), documentId, selection: requested }),
  });
  return {
    jobRunner,
    topics,
    summaries,
    selection,
    summarize: new SummarizeService({ topics, summaries, selection, jobRunner, languageModel }),
  };
}

function createAgentSessions({
  environment,
  documents,
  runtime,
  listeningPort,
}: {
  environment: Environment;
  documents: DocumentsRepository;
  runtime: ServerServices['runtime'];
  listeningPort: { value: number };
}): AgentSessions {
  return new AgentSessions({
    issueRoomToken: ({ userId, documentId }) => signRoomToken({ secret: environment.authSecret, userId, documentId, now: Date.now() }),
    collaborationUrl: () => `${LOOPBACK_WEBSOCKET_ORIGIN}:${listeningPort.value}${ApiPath.AgentCollaboration}`,
    roleOf: ({ userId, documentId }) => documents.findRole({ documentId, userId }),
    locateRoom: ({ documentId, userId }) => ({ roomMode: agentRoomMode({ runtime, documentId, userId }) }),
  });
}

function createServices({
  environment,
  databases,
  documentFilesDirectory,
  languageModel,
  versionRoomPolicy,
  projectionWorkerFile,
  agentToolkit,
  listeningPort,
  now,
}: {
  environment: Environment;
  databases: Databases;
  documentFilesDirectory: string;
  languageModel: LanguageModelChoice;
  versionRoomPolicy: VersionRoomPolicy;
  projectionWorkerFile: URL | null;
  agentToolkit: ServerServices['agentToolkit'];
  listeningPort: { value: number };
  now: () => number;
}): { auth: Auth; services: ServerServices } {
  const { database, historySqlite, readModelSqlite } = databases;
  const documents = new DocumentsRepository(database);
  const insightsRepository = new InsightsRepository(database);
  insightsRepository.failInterrupted(TOPICS_INTERRUPTED_MESSAGE);
  const updateLog = new UpdateLog(historySqlite);
  const agentActions = new AgentActionsLog(historySqlite);
  const readModel = new ReadModel(readModelSqlite);
  const scheduler = new ProjectionScheduler({ databaseDirectory: environment.databaseDirectory, projectionWorkerFile });
  const invites = new InvitesRepository({ database, appOrigin: environment.appOrigin, now });
  const passwordResetLinks = new PasswordResetLinkCapture();
  const auth = createAuth({ database, environment, invites, passwordResetLinks });
  const versions = new VersionsService({ readModel, updateLog, scheduler });
  const versionRooms = new VersionRooms({ auth, documents, versions, policy: versionRoomPolicy });
  const throttle = new ProjectionThrottle({ intervalMs: PROJECTION_THROTTLE_MS, run: (documentId) => scheduler.schedule(documentId) });
  const reservations = new CreatorReservations({ reservationMs: CREATOR_RESERVATION_MS, now });
  const bootstrap = createBootstrapState({ updateLog, readModel });
  const openBudget = new OpenBudget({ windowMs: MINUTE_MS, maxDocuments: environment.openUncommittedPerMinute, now });
  const roomModes = createRoomModes({ bootstrap, openBudget });
  const hocuspocus = createCollaborationServer({
    auth,
    documents,
    updateLog,
    reservations,
    bootstrap,
    roomModes,
    onLogged: (documentId) => throttle.request(documentId),
    onStored: (documentId) => {
      documents.touch(documentId);
      scheduler.schedule(documentId);
    },
  });
  const timelinePipelines = new TimelinePipelineCache();
  const storage = createLocalDiskFileStorage(documentFilesDirectory);
  const shareLinks = new ShareLinksRepository({ database, secret: environment.authSecret, appOrigin: environment.appOrigin });
  const insights = createInsights({ insightsRepository, scheduler, languageModel, environment, currentServices: () => services });
  const runtime = createCollaborationRuntime({
    hocuspocus,
    updateLog,
    scheduler,
    storage,
    timelinePipelines,
    versions,
    versionRooms,
    insights,
    reservations,
    bootstrap,
    roomModes,
  });
  const services: ServerServices = {
    documents,
    storage,
    updateLog,
    agentActions,
    agentSessions: createAgentSessions({ environment, documents, runtime, listeningPort }),
    agentToolkit,
    jwksUrl: () => `${LOOPBACK_HTTP_ORIGIN}:${listeningPort.value}${ApiPath.Auth}/jwks`,
    hocuspocus,
    readModel,
    scheduler,
    runtime,
    shareLinks,
    insightsRepository,
    throttle,
    reservations,
    openBudget,
    timelinePipelines,
    insights,
    versions,
    versionRooms,
    invites,
    adminUsers: new AdminUsersRepository(database),
    passwordResets: new PasswordResets({ auth, capture: passwordResetLinks, appOrigin: environment.appOrigin, now }),
  };
  return { auth, services };
}

function resumeProjections({ databases, services }: { databases: Databases; services: ServerServices }): void {
  findDocumentsToProject({ historySqlite: databases.historySqlite, readModelSqlite: databases.readModelSqlite }).forEach((documentId) =>
    services.scheduler.schedule(documentId),
  );
  findDocumentsWithoutMarks(databases.readModelSqlite).forEach(
    (documentId) => void services.scheduler.rebuild({ documentId, filePath: services.storage.pathOf(documentId) }),
  );
}

async function closeCollaboration(services: ServerServices): Promise<void> {
  await services.agentSessions.close();
  await services.versionRooms.stop();
  await services.hocuspocus.destroy();
  services.throttle.stop();
  await services.scheduler.stop();
  await services.insights.jobRunner.idle();
}

async function stopServer({
  services,
  databases,
  httpServer,
  sockets,
}: {
  services: ServerServices;
  databases: Databases;
  httpServer: ServerType;
  sockets: WebSocketServer;
}): Promise<void> {
  await closeCollaboration(services);
  sockets.clients.forEach((client) => client.terminate());
  sockets.close();
  closeAllConnectionsWhenSupported(httpServer);
  await closeServer(httpServer);
  closeDatabases(databases);
}

export async function startServer({
  environment,
  webDistDirectory,
  languageModel = chooseLanguageModel(environment.llm),
  versionRoomPolicy = DEFAULT_VERSION_ROOM_POLICY,
  projectionWorkerFile = null,
  now = Date.now,
}: {
  environment: Environment;
  webDistDirectory: string | null;
  languageModel?: LanguageModelChoice;
  versionRoomPolicy?: VersionRoomPolicy;
  projectionWorkerFile?: URL | null;
  now?: () => number;
}): Promise<RunningServer> {
  const documentFilesDirectory = join(environment.databaseDirectory, DOCUMENT_FILES_DIRECTORY);
  const databases = openDatabases({ databaseDirectory: environment.databaseDirectory, documentFilesDirectory });
  const agentToolkit = await createAgentToolkit({
    provider: AGENT_TOOLKIT_PROVIDER,
    preset: AGENT_TOOLKIT_PRESET,
    enforceChangeMode: AgentChangeMode.Tracked,
  });
  const listeningPort = { value: environment.port };
  const { auth, services } = createServices({
    environment,
    databases,
    documentFilesDirectory,
    languageModel,
    versionRoomPolicy,
    projectionWorkerFile,
    agentToolkit,
    listeningPort,
    now,
  });
  resumeProjections({ databases, services });
  const app = createApp({ auth, environment, services });
  if (webDistDirectory) mountStaticWeb({ app, webDistDirectory });
  app.notFound((context) => context.json({ error: NOT_FOUND_MESSAGE }, HttpStatus.NotFound));
  const httpServer = await listen({ app, port: environment.port, host: environment.host }).catch(async (error) => {
    await closeCollaboration(services);
    closeDatabases(databases);
    throw error;
  });
  const { port } = httpServer.address() as AddressInfo;
  listeningPort.value = port;
  const sockets = attachCollaboration({
    httpServer: httpServer as Server,
    auth,
    hocuspocus: services.hocuspocus,
    versionRooms: services.versionRooms,
    path: ApiPath.Collaboration,
    allowedOrigin: environment.appOrigin,
  });
  return {
    httpServer,
    port,
    host: environment.host,
    auth,
    database: databases.database,
    services,
    stop: () => stopServer({ services, databases, httpServer, sockets }),
  };
}
