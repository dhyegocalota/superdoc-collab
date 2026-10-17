import { SuperDocClient } from '@superdoc/sdk';
import {
  GcFreeReplays,
  ReadModel,
  REPLAY_CACHE_SIZE,
  toImportedRevisions,
  UpdateLog,
  type ListedTrackedChange,
} from '@superdoc-history/history';
import { SECOND_MS } from '@superdoc-history/types';
import { parentPort, workerData } from 'node:worker_threads';
import { HISTORY_DATABASE_FILE, openSqliteFile, READ_MODEL_DATABASE_FILE } from '../database/connection';
import { withTimeout } from '../limits/with-timeout';
import { describeError } from '../logging/describe-error';
import { createProjectionHandler } from './projection-handler';
import {
  IMPORT_TIMEOUT_MS,
  ImportTimeoutError,
  ProjectionRequestKind,
  ProjectionWorkerContextError,
  ProjectionReplyKind,
  type AnsweredRequest,
  type ProjectionFailedReply,
  type ProjectionReply,
  type ProjectionRequest,
  type ProjectionWorkerData,
} from './projection-messages';

const STOP_DISPOSE_TIMEOUT_MS = SECOND_MS;

const port = parentPort;
if (!port) throw new ProjectionWorkerContextError();
const { databaseDirectory } = workerData as ProjectionWorkerData;
const historySqlite = openSqliteFile({ directory: databaseDirectory, fileName: HISTORY_DATABASE_FILE });
const readModelSqlite = openSqliteFile({ directory: databaseDirectory, fileName: READ_MODEL_DATABASE_FILE });
const updateLog = new UpdateLog(historySqlite);
const readModel = new ReadModel(readModelSqlite);
const replays = new GcFreeReplays(REPLAY_CACHE_SIZE);
let superdocClient: Promise<SuperDocClient> | null = null;
let queue = Promise.resolve();
let importQueue = Promise.resolve();

async function connectSuperdocClient(): Promise<SuperDocClient> {
  const client = new SuperDocClient();
  await client.connect();
  return client;
}

function connectedSuperdocClient(): Promise<SuperDocClient> {
  if (superdocClient) return superdocClient;
  const connecting = connectSuperdocClient();
  superdocClient = connecting;
  connecting.catch(() => {
    superdocClient = null;
  });
  return connecting;
}

async function listRevisions(filePath: string): Promise<ListedTrackedChange[]> {
  const opened = await (await connectedSuperdocClient()).open({ doc: filePath });
  try {
    const listed = (await opened.trackChanges.list({})) as unknown as { items: ListedTrackedChange[] };
    return listed.items;
  } finally {
    await opened.close({ discard: true });
  }
}

async function importRevisions({ documentId, filePath }: { documentId: string; filePath: string }): Promise<string | null> {
  try {
    const items = await withTimeout({
      work: listRevisions(filePath),
      milliseconds: IMPORT_TIMEOUT_MS,
      onTimeout: () => {
        throw new ImportTimeoutError(IMPORT_TIMEOUT_MS);
      },
    });
    readModel.commitImported({ documentName: documentId, revisions: toImportedRevisions(items) });
    return null;
  } catch (error) {
    return describeError(error);
  }
}

const handle = createProjectionHandler({ updateLog, readModel, replays, importRevisions });

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
  if (superdocClient)
    await withTimeout({
      work: superdocClient.then(
        (client) => client.dispose(),
        () => undefined,
      ),
      milliseconds: STOP_DISPOSE_TIMEOUT_MS,
      onTimeout: () => undefined,
    }).catch(() => undefined);
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
