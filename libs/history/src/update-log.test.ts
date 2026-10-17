import * as Y from 'yjs';
import { expect, test } from 'vitest';
import { MigrationSet } from './migrations';
import { openTestDatabase } from './testing';
import { UpdateLog, compact } from './update-log';

const DOCUMENT = 'document-1';
const OTHER_DOCUMENT = 'other';

function typedUpdates(count: number): Uint8Array[] {
  const document = new Y.Doc();
  const captured: Uint8Array[] = [];
  document.on('update', (update: Uint8Array) => captured.push(update));
  Array.from({ length: count }).forEach((_, index) => document.getText('t').insert(index, 'a'));
  return captured;
}

function logWith(count: number): UpdateLog {
  const log = new UpdateLog(openTestDatabase({ set: MigrationSet.History }));
  typedUpdates(count).forEach((update) => log.append({ documentName: DOCUMENT, connectionUserId: 'ana', update }));
  return log;
}

test('binds a Uint8Array as is and stores identical bytes', () => {
  const sqlite = openTestDatabase({ set: MigrationSet.History });
  const [input] = typedUpdates(1);
  new UpdateLog(sqlite).append({ documentName: DOCUMENT, connectionUserId: 'ana', update: input! });
  const row = sqlite.prepare('SELECT update_bytes FROM updates').get() as { update_bytes: Uint8Array };
  expect(new Uint8Array(row.update_bytes)).toEqual(input);
});

test('compaction reads only the tail after the latest snapshot', () => {
  const log = logWith(25);
  expect(compact({ log, documentName: DOCUMENT, everyUpdates: 10 })).toEqual([10, 20]);
  typedUpdates(5).forEach((update) => log.append({ documentName: DOCUMENT, connectionUserId: 'ana', update }));
  expect(compact({ log, documentName: DOCUMENT, everyUpdates: 10 })).toEqual([30]);
});

test('readBatch returns the next sequences after a cursor', () => {
  const batch = logWith(5).readBatch({ documentName: DOCUMENT, afterSequence: 1, limit: 2 });
  expect(batch.map((update) => update.sequence)).toEqual([2, 3]);
});

test('forget removes one document and keeps the others', () => {
  const log = logWith(3);
  typedUpdates(1).forEach((update) => log.append({ documentName: OTHER_DOCUMENT, connectionUserId: 'bruno', update }));
  log.forget(DOCUMENT);
  expect(log.hasUpdates(DOCUMENT)).toBe(false);
  expect(log.clientIdentities(DOCUMENT).size).toBe(0);
  expect(log.hasUpdates(OTHER_DOCUMENT)).toBe(true);
});

test('serverTimeOf answers the logged time for a sequence of the document and null otherwise', () => {
  const log = logWith(3);
  typedUpdates(1).forEach((update) => log.append({ documentName: OTHER_DOCUMENT, connectionUserId: 'bruno', update }));
  const [first] = log.read({ documentName: DOCUMENT, untilSequence: 1 });
  expect(log.serverTimeOf({ documentName: DOCUMENT, sequence: 1 })).toBe(first!.serverTime);
  expect(log.serverTimeOf({ documentName: DOCUMENT, sequence: 99 })).toBeNull();
  expect(log.serverTimeOf({ documentName: DOCUMENT, sequence: 4 })).toBeNull();
});
