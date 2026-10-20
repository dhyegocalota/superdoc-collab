import { GcFreeReplays, MigrationSet, ReadModel, REPLAY_CACHE_SIZE, UpdateLog } from '@superdoc-collab/history';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BOOTSTRAP_MS_PER_MEGABYTE,
  BOOTSTRAP_TIMEOUT_FLOOR_MS,
  BOOTSTRAP_TIMEOUT_MARGIN,
  bootstrapTimeoutMsOf,
  BootstrapLane,
  BYTES_PER_MEGABYTE,
  MAX_REVISIONS_IMPORT_BYTES,
  MAX_UPLOAD_BYTES,
} from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { HISTORY_DATABASE_FILE, openSqliteFile, READ_MODEL_DATABASE_FILE } from '../database/connection';
import { runHistoryMigrations } from '../database/migrate';
import { createProjectionHandler } from './projection-handler';
import {
  BootstrapTimeoutError,
  IMPORT_TOO_LARGE_MESSAGE,
  MissingVersionMarkError,
  ProjectionRequestKind,
  type BootstrapRequest,
} from './projection-messages';

const DOCUMENT_ID = 'd1';

const SMALL_FILE_BYTES = 1024;
const SHORT_TIMEOUT_MS = 20;
const BOOTSTRAP_REQUEST = {
  kind: ProjectionRequestKind.Bootstrap,
  documentId: DOCUMENT_ID,
  filePath: 'plan.docx',
  url: 'ws://127.0.0.1:1/collaboration/bootstrap',
  token: 'bootstrap-token',
  lane: BootstrapLane.Heavy,
  documentXmlBytes: SMALL_FILE_BYTES,
} as const;

function storesWith(
  importRevisions: (request: { documentId: string; filePath: string }) => Promise<string | null>,
  fileSizeBytes: (filePath: string) => number = () => SMALL_FILE_BYTES,
  bootstrapRoom: (request: BootstrapRequest) => Promise<void> = async () => undefined,
  timeoutMsOf: (documentXmlBytes: number) => number = bootstrapTimeoutMsOf,
  releaseBootstrapHost: (lane: BootstrapLane) => Promise<void> = async () => undefined,
) {
  const directory = mkdtempSync(join(tmpdir(), 'projection-handler-'));
  const historySqlite = openSqliteFile({ directory, fileName: HISTORY_DATABASE_FILE });
  runHistoryMigrations({ sqlite: historySqlite, set: MigrationSet.History });
  const readModelSqlite = openSqliteFile({ directory, fileName: READ_MODEL_DATABASE_FILE });
  runHistoryMigrations({ sqlite: readModelSqlite, set: MigrationSet.ReadModel });
  return {
    updateLog: new UpdateLog(historySqlite),
    readModel: new ReadModel(readModelSqlite),
    replays: new GcFreeReplays(REPLAY_CACHE_SIZE),
    importRevisions,
    fileSizeBytes,
    bootstrapRoom,
    bootstrapTimeoutMsOf: timeoutMsOf,
    releaseBootstrapHost,
  };
}

test('projecting an empty log answers a null cursor', async () => {
  const handle = createProjectionHandler(storesWith(async () => null));
  expect(await handle({ kind: ProjectionRequestKind.Project, documentId: DOCUMENT_ID })).toEqual({
    kind: ProjectionRequestKind.Project,
    documentId: DOCUMENT_ID,
    cursor: null,
    importError: null,
  });
});

test('an import reads the cursor before importing and answers the import error', async () => {
  const importRevisions = vi.fn(async () => 'boom');
  const stores = storesWith(importRevisions);
  const cursor = vi.spyOn(stores.readModel, 'cursor');
  const request = { kind: ProjectionRequestKind.Import, documentId: DOCUMENT_ID, filePath: 'plan.docx' } as const;
  expect(await createProjectionHandler(stores)(request)).toEqual({
    kind: ProjectionRequestKind.Import,
    documentId: DOCUMENT_ID,
    cursor: null,
    importError: 'boom',
  });
  expect(importRevisions).toHaveBeenCalledWith(request);
  expect(cursor.mock.invocationCallOrder[0]).toBeLessThan(importRevisions.mock.invocationCallOrder[0]!);
});

test('a file above the revisions cap is not imported, is logged with its size and answers no import error', async () => {
  const importRevisions = vi.fn(async () => 'boom');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const oversizedBytes = MAX_REVISIONS_IMPORT_BYTES + 1;
  const stores = storesWith(importRevisions, () => oversizedBytes);
  const request = { kind: ProjectionRequestKind.Import, documentId: DOCUMENT_ID, filePath: 'plan.docx' } as const;
  expect(await createProjectionHandler(stores)(request)).toEqual({
    kind: ProjectionRequestKind.Import,
    documentId: DOCUMENT_ID,
    cursor: null,
    importError: null,
  });
  expect(importRevisions).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledExactlyOnceWith(`${IMPORT_TOO_LARGE_MESSAGE} ${DOCUMENT_ID}: ${oversizedBytes} bytes`);
  warn.mockRestore();
});

test('a file whose size cannot be read answers the error instead of throwing', async () => {
  const importRevisions = vi.fn(async () => null);
  const unreadable = () => {
    throw new Error('no such file');
  };
  const request = { kind: ProjectionRequestKind.Import, documentId: DOCUMENT_ID, filePath: 'plan.docx' } as const;
  expect(await createProjectionHandler(storesWith(importRevisions, unreadable))(request)).toMatchObject({
    importError: 'Error: no such file',
  });
  expect(importRevisions).not.toHaveBeenCalled();
});

test('a file exactly at the revisions cap is imported', async () => {
  const importRevisions = vi.fn(async () => null);
  const request = { kind: ProjectionRequestKind.Import, documentId: DOCUMENT_ID, filePath: 'plan.docx' } as const;
  await createProjectionHandler(storesWith(importRevisions, () => MAX_REVISIONS_IMPORT_BYTES))(request);
  expect(importRevisions).toHaveBeenCalledWith(request);
});

test('forgetting clears the replays before the read model and answers a null cursor', async () => {
  const stores = storesWith(async () => null);
  const [replays, readModel] = [vi.spyOn(stores.replays, 'forget'), vi.spyOn(stores.readModel, 'forget')];
  expect(await createProjectionHandler(stores)({ kind: ProjectionRequestKind.Forget, documentId: DOCUMENT_ID })).toEqual({
    kind: ProjectionRequestKind.Forget,
    documentId: DOCUMENT_ID,
    cursor: null,
    importError: null,
  });
  expect(replays.mock.invocationCallOrder[0]).toBeLessThan(readModel.mock.invocationCallOrder[0]!);
});

test('blocks of an unprojected document are empty at sequence zero', async () => {
  const handle = createProjectionHandler(storesWith(async () => null));
  expect(await handle({ kind: ProjectionRequestKind.Blocks, documentId: DOCUMENT_ID })).toEqual({
    kind: ProjectionRequestKind.Blocks,
    documentId: DOCUMENT_ID,
    sequence: 0,
    blocks: [],
  });
});

test('a version without a mark fails with the missing mark error', async () => {
  const handle = createProjectionHandler(storesWith(async () => null));
  await expect(handle({ kind: ProjectionRequestKind.Version, documentId: DOCUMENT_ID, sequence: 5 })).rejects.toBeInstanceOf(
    MissingVersionMarkError,
  );
});

test('a bootstrap joins the room of the stored file and answers its document', async () => {
  const bootstrapRoom = vi.fn(async () => undefined);
  const handle = createProjectionHandler(
    storesWith(
      async () => null,
      () => SMALL_FILE_BYTES,
      bootstrapRoom,
    ),
  );
  expect(await handle(BOOTSTRAP_REQUEST)).toEqual({ kind: ProjectionRequestKind.Bootstrap, documentId: DOCUMENT_ID });
  expect(bootstrapRoom).toHaveBeenCalledExactlyOnceWith({
    documentId: DOCUMENT_ID,
    filePath: BOOTSTRAP_REQUEST.filePath,
    url: BOOTSTRAP_REQUEST.url,
    token: BOOTSTRAP_REQUEST.token,
    lane: BOOTSTRAP_REQUEST.lane,
  });
});

test('a bootstrap that throws rejects with the error', async () => {
  const bootstrapRoom = vi.fn(async () => {
    throw new Error('not a document');
  });
  const handle = createProjectionHandler(
    storesWith(
      async () => null,
      () => SMALL_FILE_BYTES,
      bootstrapRoom,
    ),
  );
  await expect(handle(BOOTSTRAP_REQUEST)).rejects.toThrow('not a document');
});

test('a bootstrap that outlives its timeout rejects with the timeout error', async () => {
  const bootstrapRoom = vi.fn(() => new Promise<void>(() => undefined));
  const handle = createProjectionHandler(
    storesWith(
      async () => null,
      () => SMALL_FILE_BYTES,
      bootstrapRoom,
      () => SHORT_TIMEOUT_MS,
    ),
  );
  await expect(handle(BOOTSTRAP_REQUEST)).rejects.toBeInstanceOf(BootstrapTimeoutError);
});

test('a bootstrap releases the host once it joined the room', async () => {
  const releaseBootstrapHost = vi.fn(async () => undefined);
  const handle = createProjectionHandler(
    storesWith(
      async () => null,
      () => SMALL_FILE_BYTES,
      async () => undefined,
      bootstrapTimeoutMsOf,
      releaseBootstrapHost,
    ),
  );
  await handle(BOOTSTRAP_REQUEST);
  expect(releaseBootstrapHost).toHaveBeenCalledExactlyOnceWith(BootstrapLane.Heavy);
});

test('a bootstrap that throws releases the host before it rejects', async () => {
  const order: string[] = [];
  const handle = createProjectionHandler(
    storesWith(
      async () => null,
      () => SMALL_FILE_BYTES,
      async () => {
        throw new Error('not a document');
      },
      bootstrapTimeoutMsOf,
      async () => void order.push('released'),
    ),
  );
  await handle(BOOTSTRAP_REQUEST).catch(() => order.push('rejected'));
  expect(order).toEqual(['released', 'rejected']);
});

test('a bootstrap that outlives its timeout releases the host before it rejects', async () => {
  const order: string[] = [];
  const handle = createProjectionHandler(
    storesWith(
      async () => null,
      () => SMALL_FILE_BYTES,
      () => new Promise<void>(() => undefined),
      () => SHORT_TIMEOUT_MS,
      async () => void order.push('released'),
    ),
  );
  await handle(BOOTSTRAP_REQUEST).catch(() => order.push('rejected'));
  expect(order).toEqual(['released', 'rejected']);
});

const TIMEOUT_MARGIN_MS = 1;

test.each([SMALL_FILE_BYTES, MAX_UPLOAD_BYTES])(
  'a bootstrap of a document with %i bytes of XML is cut at the floor plus the margin times the measured rate, whatever the size of the file',
  async (documentXmlBytes) => {
    vi.useFakeTimers();
    const timeoutMs =
      BOOTSTRAP_TIMEOUT_FLOOR_MS + (documentXmlBytes / BYTES_PER_MEGABYTE) * BOOTSTRAP_MS_PER_MEGABYTE * BOOTSTRAP_TIMEOUT_MARGIN;
    const handle = createProjectionHandler(
      storesWith(
        async () => null,
        () => SMALL_FILE_BYTES,
        () => new Promise<void>(() => undefined),
      ),
    );
    const outcome = handle({ ...BOOTSTRAP_REQUEST, documentXmlBytes }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(timeoutMs - TIMEOUT_MARGIN_MS);
    const settledEarly = await Promise.race([outcome, Promise.resolve(null)]);
    expect(settledEarly).toBeNull();
    await vi.advanceTimersByTimeAsync(TIMEOUT_MARGIN_MS);
    expect(await outcome).toEqual(new BootstrapTimeoutError(timeoutMs));
    vi.useRealTimers();
  },
);
