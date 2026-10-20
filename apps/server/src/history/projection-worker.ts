import { SuperDocClient } from '@superdoc/sdk';
import { ReadModel, toImportedRevisions, UpdateLog, type ListedTrackedChange } from '@superdoc-collab/history';
import { BOOTSTRAP_HOST_TIMEOUT_MS, bootstrapTimeoutMsOf, BootstrapLane, RoomMode, SECOND_MS } from '@superdoc-collab/types';
import { statSync } from 'node:fs';
import v8 from 'node:v8';
import vm from 'node:vm';
import { parentPort, workerData } from 'node:worker_threads';
import { COLLABORATION_PROVIDER, SDK_RUNTIME } from '../collaboration/sdk-room';
import { HISTORY_DATABASE_FILE, openSqliteFile, READ_MODEL_DATABASE_FILE } from '../database/connection';
import { withTimeout } from '../limits/with-timeout';
import { describeError } from '../logging/describe-error';
import { assertBootstrapApplied } from './bootstrap-applied';
import { bootstrapHostEnvironment } from './bootstrap-host-environment';
import { createProjectionHandler } from './projection-handler';
import { createProjectionQueues } from './projection-queues';
import { createRetainedHeapReader } from './retained-heap';
import {
  IMPORT_TIMEOUT_MS,
  ImportTimeoutError,
  ProjectionRequestKind,
  ProjectionWorkerContextError,
  ProjectionReplyKind,
  type AnsweredReply,
  type AnsweredRequest,
  type BootstrapRequest,
  type ProjectionFailedReply,
  type ProjectionReply,
  type ProjectionRequest,
  type ProjectionWorkerData,
} from './projection-messages';

const STOP_DISPOSE_TIMEOUT_MS = SECOND_MS;
const HOST_RELEASE_TIMEOUT_MS = 6 * SECOND_MS;
const EXPOSE_COLLECTOR_FLAG = '--expose-gc';
const COLLECTOR_NAME = 'gc';

function exposeCollector(): () => void {
  v8.setFlagsFromString(EXPOSE_COLLECTOR_FLAG);
  return vm.runInNewContext(COLLECTOR_NAME) as () => void;
}
const BOOTSTRAP_HOST_NAME = 'SuperDoc History bootstrap';
const BOOTSTRAP_HOST_EMAIL = 'bootstrap@superdoc-history.local';

const port = parentPort;
if (!port) throw new ProjectionWorkerContextError();
const { databaseDirectory, hostHeapMegabytes } = workerData as ProjectionWorkerData;
const historySqlite = openSqliteFile({ directory: databaseDirectory, fileName: HISTORY_DATABASE_FILE });
const readModelSqlite = openSqliteFile({ directory: databaseDirectory, fileName: READ_MODEL_DATABASE_FILE });
const updateLog = new UpdateLog(historySqlite);
const readModel = new ReadModel(readModelSqlite);

type SuperdocClientOptions = ConstructorParameters<typeof SuperDocClient>[0];

async function connectSuperdocClient(options: SuperdocClientOptions): Promise<SuperDocClient> {
  const client = new SuperDocClient(options);
  await client.connect();
  return client;
}

function sharedSuperdocClient(options: SuperdocClientOptions): {
  connected: () => Promise<SuperDocClient>;
  pending: () => Promise<SuperDocClient> | null;
  release: () => Promise<void>;
} {
  const shared: { connection: Promise<SuperDocClient> | null } = { connection: null };
  return {
    pending: () => shared.connection,
    release: async () => {
      const releasing = shared.connection;
      shared.connection = null;
      await disposeSuperdocClient({ pending: releasing, milliseconds: HOST_RELEASE_TIMEOUT_MS });
    },
    connected: () => {
      if (shared.connection) return shared.connection;
      const connecting = connectSuperdocClient(options);
      shared.connection = connecting;
      connecting.catch(() => {
        shared.connection = null;
      });
      return connecting;
    },
  };
}

const importClient = sharedSuperdocClient({ env: bootstrapHostEnvironment({ source: process.env, heapMegabytes: null }) });
function bootstrapSuperdocClient(): ReturnType<typeof sharedSuperdocClient> {
  return sharedSuperdocClient({
    user: { name: BOOTSTRAP_HOST_NAME, email: BOOTSTRAP_HOST_EMAIL },
    requestTimeoutMs: BOOTSTRAP_HOST_TIMEOUT_MS,
    env: bootstrapHostEnvironment({ source: process.env, heapMegabytes: hostHeapMegabytes }),
  });
}

const bootstrapClients: Record<BootstrapLane, ReturnType<typeof sharedSuperdocClient>> = {
  [BootstrapLane.Light]: bootstrapSuperdocClient(),
  [BootstrapLane.Heavy]: bootstrapSuperdocClient(),
};

async function listRevisions(filePath: string): Promise<ListedTrackedChange[]> {
  const opened = await (await importClient.connected()).open({ doc: filePath });
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

async function bootstrapRoom({ documentId, filePath, url, token, lane }: BootstrapRequest): Promise<void> {
  const opened = await (
    await bootstrapClients[lane].connected()
  ).open(
    {
      runtime: SDK_RUNTIME,
      doc: filePath,
      collaboration: { providerType: COLLABORATION_PROVIDER, url, documentId, roomMode: RoomMode.Create },
    },
    { collaborationAuth: { type: 'token', token } },
  );
  assertBootstrapApplied(opened.openResult);
  await opened.close({ discard: true });
}

const handle = createProjectionHandler({
  updateLog,
  readModel,
  importRevisions,
  fileSizeBytes: (filePath) => statSync(filePath).size,
  bootstrapRoom,
  bootstrapTimeoutMsOf,
  releaseBootstrapHost: (lane) => bootstrapClients[lane].release(),
});

function failureOf({ request, message }: { request: AnsweredRequest; message: string }): ProjectionFailedReply {
  const base = { kind: ProjectionReplyKind.Failed, documentId: request.documentId, message } as const;
  if (request.kind === ProjectionRequestKind.Version) return { ...base, requestKind: request.kind, sequence: request.sequence };
  return { ...base, requestKind: request.kind, sequence: null };
}

async function answer(request: AnsweredRequest): Promise<AnsweredReply | ProjectionFailedReply> {
  try {
    return await handle(request);
  } catch (error) {
    return failureOf({ request, message: describeError(error) });
  }
}

const readRetainedHeap = createRetainedHeapReader({
  memoryUsage: () => process.memoryUsage(),
  collectGarbage: exposeCollector(),
});

async function disposeSuperdocClient({
  pending,
  milliseconds,
}: {
  pending: Promise<SuperDocClient> | null;
  milliseconds: number;
}): Promise<void> {
  if (!pending) return;
  await withTimeout({
    work: pending.then(
      (client) => client.dispose(),
      () => undefined,
    ),
    milliseconds,
    onTimeout: () => undefined,
  }).catch(() => undefined);
}

async function stopWorker(): Promise<void> {
  await Promise.all(
    [importClient, ...Object.values(bootstrapClients)].map((client) =>
      disposeSuperdocClient({ pending: client.pending(), milliseconds: STOP_DISPOSE_TIMEOUT_MS }),
    ),
  );
  historySqlite.close();
  readModelSqlite.close();
  process.exit(0);
}

const enqueue = createProjectionQueues({
  reply: async (request) => port.postMessage(await answer(request)),
  stop: stopWorker,
  measure: async () => port.postMessage({ kind: ProjectionRequestKind.Measure, retainedHeapBytes: readRetainedHeap() }),
});

port.on('message', (request: ProjectionRequest) => enqueue(request));
