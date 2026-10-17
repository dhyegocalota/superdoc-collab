import { SuperDocClient } from '@superdoc/sdk';
import { compact, GcFreeReplays, materialize, projectPending, ReadModel, readMainStoryBlocks, readMainStoryText, REPLAY_CACHE_SIZE, toImportedRevisions, UpdateLog, type ListedTrackedChange } from '@superdoc-history/history';
import * as Y from 'yjs';
import { parentPort, workerData } from 'node:worker_threads';
import { HISTORY_DATABASE_FILE, openSqliteFile, READ_MODEL_DATABASE_FILE } from '../database/connection';
import { describeError, IMPORT_TIMEOUT_MS, ImportTimeoutError, MissingVersionMarkError, ProjectionRequestKind, ProjectionWorkerContextError, ProjectionReplyKind, SNAPSHOT_EVERY_UPDATES, type BlocksReply, type ProjectionDoneReply, type ProjectionFailedReply, type ProjectionReply, type ProjectionRequest, type ProjectionWorkerData, type VersionReply } from './projection-messages';

const STOP_DISPOSE_TIMEOUT_MS = 1000;

const port = parentPort;
if (!port) throw new ProjectionWorkerContextError();
const { databaseDirectory } = workerData as ProjectionWorkerData;
const historySqlite = openSqliteFile({ directory: databaseDirectory, fileName: HISTORY_DATABASE_FILE });
const readModelSqlite = openSqliteFile({ directory: databaseDirectory, fileName: READ_MODEL_DATABASE_FILE });
const log = new UpdateLog(historySqlite);
const readModel = new ReadModel(readModelSqlite);
const replays = new GcFreeReplays(REPLAY_CACHE_SIZE);
let sdkConnection: Promise<SuperDocClient> | null = null;
let queue = Promise.resolve();
let importQueue = Promise.resolve();

async function connectSdk(): Promise<SuperDocClient> {
  const client = new SuperDocClient();
  await client.connect();
  return client;
}

function connectedSdk(): Promise<SuperDocClient> {
  if (sdkConnection) return sdkConnection;
  const connecting = connectSdk();
  sdkConnection = connecting;
  connecting.catch(() => {
    sdkConnection = null;
  });
  return connecting;
}

function withTimeout<Value>({ work, milliseconds }: { work: Promise<Value>; milliseconds: number }): Promise<Value> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ImportTimeoutError(milliseconds)), milliseconds);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

async function listRevisions(filePath: string): Promise<ListedTrackedChange[]> {
  const opened = await (await connectedSdk()).open({ doc: filePath });
  try {
    const listed = (await opened.trackChanges.list({})) as unknown as { items: ListedTrackedChange[] };
    return listed.items;
  } finally {
    await opened.close({ discard: true });
  }
}

async function importRevisions({ documentId, filePath }: { documentId: string; filePath: string }): Promise<string | null> {
  try {
    const items = await withTimeout({ work: listRevisions(filePath), milliseconds: IMPORT_TIMEOUT_MS });
    readModel.commitImported({ documentName: documentId, revisions: toImportedRevisions(items) });
    return null;
  } catch (error) {
    return describeError(error);
  }
}

type AnsweredRequest = Exclude<ProjectionRequest, { kind: ProjectionRequestKind.Stop }>;

function versionReply({ documentId, sequence }: { documentId: string; sequence: number }): VersionReply {
  const mark = readModel.mark({ documentName: documentId, sequence });
  if (!mark) throw new MissingVersionMarkError({ documentId, sequence });
  const version = replays.version({ log, documentName: documentId, mark });
  return { kind: ProjectionRequestKind.Version, documentId, sequence, serverTime: mark.serverTime, state: Y.encodeStateAsUpdate(version), text: readMainStoryText(version) };
}

function blocksReply(documentId: string): BlocksReply {
  const cursor = readModel.cursor(documentId);
  if (cursor === null) return { kind: ProjectionRequestKind.Blocks, documentId, sequence: 0, blocks: [] };
  return { kind: ProjectionRequestKind.Blocks, documentId, sequence: cursor, blocks: readMainStoryBlocks(materialize({ log, documentName: documentId, untilSequence: cursor })) };
}

async function handle(request: AnsweredRequest): Promise<ProjectionDoneReply | VersionReply | BlocksReply> {
  const { kind, documentId } = request;
  if (request.kind === ProjectionRequestKind.Version) return versionReply(request);
  if (request.kind === ProjectionRequestKind.Blocks) return blocksReply(documentId);
  if (request.kind === ProjectionRequestKind.Project) compact({ log, documentName: documentId, everyUpdates: SNAPSHOT_EVERY_UPDATES });
  if (kind === ProjectionRequestKind.Forget) replays.forget(documentId);
  if (request.kind === ProjectionRequestKind.Import) return { kind, documentId, cursor: readModel.cursor(documentId), importError: await importRevisions(request) };
  if (kind === ProjectionRequestKind.Forget) readModel.forget(documentId);
  if (kind === ProjectionRequestKind.Project) return { kind, documentId, cursor: projectPending({ log, readModel, documentName: documentId }), importError: null };
  return { kind, documentId, cursor: readModel.cursor(documentId), importError: null };
}

function failureOf({ request, message }: { request: AnsweredRequest; message: string }): ProjectionFailedReply {
  const base = { kind: ProjectionReplyKind.Failed, documentId: request.documentId, message } as const;
  if (request.kind === ProjectionRequestKind.Version) return { ...base, requestKind: request.kind, sequence: request.sequence };
  return { ...base, requestKind: request.kind, sequence: null };
}

async function answer(request: AnsweredRequest): Promise<ProjectionReply> {
  try {
    return await handle(request);
  } catch (error) {
    return failureOf({ request, message: describeError(error) });
  }
}

async function stopWorker(): Promise<void> {
  if (sdkConnection) await withTimeout({ work: sdkConnection.then((client) => client.dispose(), () => undefined), milliseconds: STOP_DISPOSE_TIMEOUT_MS }).catch(() => undefined);
  historySqlite.close();
  readModelSqlite.close();
  process.exit(0);
}

port.on('message', (request: ProjectionRequest) => {
  if (request.kind === ProjectionRequestKind.Stop) {
    queue = queue.then(stopWorker);
    return;
  }
  const reply = async () => port.postMessage(await answer(request));
  if (request.kind === ProjectionRequestKind.Import) {
    importQueue = importQueue.then(reply);
    return;
  }
  if (request.kind === ProjectionRequestKind.Forget) {
    queue = Promise.all([queue, importQueue]).then(reply);
    return;
  }
  queue = queue.then(reply);
});
