import { SuperDocClient } from '@superdoc/sdk';
import { projectPending, ReadModel, toImportedRevisions, UpdateLog, type ListedTrackedChange } from '@superdoc-history/history';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { HISTORY_DATABASE_FILE, openSqliteFile, READ_MODEL_DATABASE_FILE } from '../database/connection';
import { describeError, IMPORT_TIMEOUT_MS, ImportTimeoutError, ProjectionRequestKind, ProjectionWorkerContextError, ProjectionReplyKind, type ProjectionDoneReply, type ProjectionReply, type ProjectionRequest, type ProjectionWorkerData } from './projection-messages';

const port = parentPort;
if (!port) throw new ProjectionWorkerContextError();
const { databaseDirectory } = workerData as ProjectionWorkerData;
const historySqlite = new Database(join(databaseDirectory, HISTORY_DATABASE_FILE), { readonly: true });
const readModelSqlite = openSqliteFile({ directory: databaseDirectory, fileName: READ_MODEL_DATABASE_FILE });
const log = new UpdateLog(historySqlite);
const readModel = new ReadModel(readModelSqlite);
let sdkConnection: Promise<SuperDocClient> | null = null;
let queue = Promise.resolve();

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

async function handle(request: Exclude<ProjectionRequest, { kind: ProjectionRequestKind.Stop }>): Promise<ProjectionDoneReply> {
  const { kind, documentId } = request;
  if (request.kind === ProjectionRequestKind.Import) return { kind, documentId, cursor: readModel.cursor(documentId), importError: await importRevisions(request) };
  if (kind === ProjectionRequestKind.Forget) readModel.forget(documentId);
  if (kind === ProjectionRequestKind.Project) return { kind, documentId, cursor: projectPending({ log, readModel, documentName: documentId }), importError: null };
  return { kind, documentId, cursor: readModel.cursor(documentId), importError: null };
}

async function answer(request: Exclude<ProjectionRequest, { kind: ProjectionRequestKind.Stop }>): Promise<ProjectionReply> {
  try {
    return await handle(request);
  } catch (error) {
    return { kind: ProjectionReplyKind.Failed, documentId: request.documentId, message: describeError(error) };
  }
}

async function stopWorker(): Promise<void> {
  if (sdkConnection) await sdkConnection.then((client) => client.dispose(), () => undefined);
  historySqlite.close();
  readModelSqlite.close();
  process.exit(0);
}

port.on('message', (request: ProjectionRequest) => {
  if (request.kind === ProjectionRequestKind.Stop) {
    queue = queue.then(stopWorker);
    return;
  }
  queue = queue.then(async () => port.postMessage(await answer(request)));
});
