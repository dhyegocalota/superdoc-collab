import { ClientActor } from '@superdoc-collab/types';
import { MigrationSet, ReadModel, UpdateLog } from '@superdoc-collab/history';
import { commitBootstrap, openTestDatabase } from '@superdoc-collab/history/testing';
import * as Y from 'yjs';
import { expect, test, vi } from 'vitest';
import { createBootstrapState } from './bootstrap-state';

const DOCUMENT_ID = 'document-1';
const COMMIT_SEQUENCE = 7;
const TEXT_NAME = 't';
const LIVE_TEXT = 'live room';
const MISSING_SNAPSHOT_MESSAGE = 'no snapshot was written';

function stateOver(): { updateLog: UpdateLog; readModel: ReadModel; close: () => void } {
  const historySqlite = openTestDatabase({ set: MigrationSet.History });
  const readModelSqlite = openTestDatabase({ set: MigrationSet.ReadModel });
  return {
    updateLog: new UpdateLog(historySqlite),
    readModel: new ReadModel(readModelSqlite),
    close: () => [historySqlite, readModelSqlite].forEach((sqlite) => sqlite.close()),
  };
}

test('markCommitted writes a snapshot of the live room at the commit sequence', () => {
  const { updateLog, readModel, close } = stateOver();
  const bootstrap = createBootstrapState({ updateLog, readModel });
  const liveRoom = new Y.Doc();
  liveRoom.getText(TEXT_NAME).insert(0, LIVE_TEXT);
  const readBatch = vi.spyOn(updateLog, 'readBatch');
  bootstrap.markCommitted({ documentId: DOCUMENT_ID, sequence: COMMIT_SEQUENCE, document: liveRoom });
  const snapshot = updateLog.latestSnapshot({ documentName: DOCUMENT_ID, atOrBefore: COMMIT_SEQUENCE });
  if (!snapshot) throw new Error(MISSING_SNAPSHOT_MESSAGE);
  const restored = new Y.Doc();
  Y.applyUpdate(restored, snapshot.state);
  expect([snapshot.sequence, restored.getText(TEXT_NAME).toString()]).toEqual([COMMIT_SEQUENCE, LIVE_TEXT]);
  expect(bootstrap.isCommitted(DOCUMENT_ID)).toBe(true);
  expect(readBatch).not.toHaveBeenCalled();
  close();
});

test('isCommitted reads a committed room once and caches it', () => {
  const { updateLog, readModel, close } = stateOver();
  const bootstrap = createBootstrapState({ updateLog, readModel });
  const committed = new Y.Doc();
  commitBootstrap(committed);
  updateLog.append({
    documentName: DOCUMENT_ID,
    connectionUserId: 'user-1',
    connectionActor: ClientActor.Human,
    update: Y.encodeStateAsUpdate(committed),
  });
  const readBatch = vi.spyOn(updateLog, 'readBatch');
  expect(bootstrap.isCommitted(DOCUMENT_ID)).toBe(true);
  const readsAfterFirstCall = readBatch.mock.calls.length;
  expect(bootstrap.isCommitted(DOCUMENT_ID)).toBe(true);
  expect([readsAfterFirstCall > 0, readBatch.mock.calls.length]).toEqual([true, readsAfterFirstCall]);
  close();
});
