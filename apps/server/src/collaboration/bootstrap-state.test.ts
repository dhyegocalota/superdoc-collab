import { ClientActor } from '@superdoc-collab/types';
import { MigrationSet, ReadModel, UpdateLog } from '@superdoc-collab/history';
import { commitBootstrap, openTestDatabase } from '@superdoc-collab/history/testing';
import * as Y from 'yjs';
import { expect, test, vi } from 'vitest';
import { createBootstrapState } from './bootstrap-state';

const DOCUMENT_ID = 'document-1';
const USER_ID = 'user-1';
const TEXT_NAME = 't';
const LIVE_TEXT = 'live room';
const META_MAP = 'meta';
const BOOTSTRAP_STATE_KEY = 'bootstrapState';
const ABANDONED_CLIENT_ID = 900;
const WINNER_CLIENT_ID = 100;
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

function appendChange({ updateLog, document, change }: { updateLog: UpdateLog; document: Y.Doc; change: () => void }): number {
  const captured: Uint8Array[] = [];
  document.once('update', (update: Uint8Array) => captured.push(update));
  change();
  return updateLog.append({
    documentName: DOCUMENT_ID,
    connectionUserId: USER_ID,
    connectionActor: ClientActor.Human,
    update: captured[0]!,
  }).sequence;
}

test('commit appends the committing update and a snapshot of the live room at its sequence', () => {
  const { updateLog, readModel, close } = stateOver();
  const bootstrap = createBootstrapState({ updateLog, readModel });
  const liveRoom = new Y.Doc();
  liveRoom.getText(TEXT_NAME).insert(0, LIVE_TEXT);
  const readBatch = vi.spyOn(updateLog, 'readBatch');
  const committed = bootstrap.commit({
    documentId: DOCUMENT_ID,
    connectionUserId: USER_ID,
    connectionActor: ClientActor.Human,
    update: Y.encodeStateAsUpdate(liveRoom),
    document: liveRoom,
  });
  const snapshot = updateLog.latestSnapshot({ documentName: DOCUMENT_ID, atOrBefore: committed.sequence });
  if (!snapshot) throw new Error(MISSING_SNAPSHOT_MESSAGE);
  const restored = new Y.Doc();
  Y.applyUpdate(restored, snapshot.state);
  expect([snapshot.sequence, restored.getText(TEXT_NAME).toString()]).toEqual([committed.sequence, LIVE_TEXT]);
  expect(updateLog.hasUpdates(DOCUMENT_ID)).toBe(true);
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
    connectionUserId: USER_ID,
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

test('isCommitted trusts the snapshot when a replay of the log never sees the commit', () => {
  const { updateLog, readModel, close } = stateOver();
  const abandoned = new Y.Doc();
  abandoned.clientID = ABANDONED_CLIENT_ID;
  appendChange({ updateLog, document: abandoned, change: () => abandoned.getMap(META_MAP).set(BOOTSTRAP_STATE_KEY, 'pending') });
  const winner = new Y.Doc();
  winner.clientID = WINNER_CLIENT_ID;
  appendChange({ updateLog, document: winner, change: () => winner.getMap(META_MAP).set(BOOTSTRAP_STATE_KEY, 'pending') });
  const committedSequence = appendChange({ updateLog, document: winner, change: () => commitBootstrap(winner) });
  expect(createBootstrapState({ updateLog, readModel }).isCommitted(DOCUMENT_ID)).toBe(false);
  updateLog.writeSnapshot({ documentName: DOCUMENT_ID, sequence: committedSequence, state: Y.encodeStateAsUpdate(winner) });
  expect(createBootstrapState({ updateLog, readModel }).isCommitted(DOCUMENT_ID)).toBe(true);
  close();
});
