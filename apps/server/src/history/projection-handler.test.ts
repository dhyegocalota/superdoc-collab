import { GcFreeReplays, MigrationSet, ReadModel, REPLAY_CACHE_SIZE, UpdateLog } from '@superdoc-collab/history';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_REVISIONS_IMPORT_BYTES } from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { HISTORY_DATABASE_FILE, openSqliteFile, READ_MODEL_DATABASE_FILE } from '../database/connection';
import { runHistoryMigrations } from '../database/migrate';
import { createProjectionHandler } from './projection-handler';
import { IMPORT_TOO_LARGE_MESSAGE, MissingVersionMarkError, ProjectionRequestKind } from './projection-messages';

const DOCUMENT_ID = 'd1';

const SMALL_FILE_BYTES = 1024;

function storesWith(
  importRevisions: (request: { documentId: string; filePath: string }) => Promise<string | null>,
  fileSizeBytes: (filePath: string) => number = () => SMALL_FILE_BYTES,
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
