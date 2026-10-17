import { ClientActor } from '@superdoc-history/types';
import * as Y from 'yjs';
import { expect, test } from 'vitest';
import { MigrationSet } from './migrations';
import { openTestDatabase } from './testing';
import { UpdateLog, compact, materialize, replay } from './update-log';

const DOCUMENT = 'snapshot-room';
const UPDATES = 250;
const SNAPSHOT_EVERY = 40;
const REMOTE_ORIGIN = 'remote';

function seededLog(): { log: UpdateLog; close: () => void } {
  const sqlite = openTestDatabase({ set: MigrationSet.History });
  const log = new UpdateLog(sqlite);
  const authors = [new Y.Doc(), new Y.Doc()];
  authors.forEach((author) =>
    author.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN) return;
      log.append({ documentName: DOCUMENT, connectionUserId: `user-${author.clientID}`, connectionActor: ClientActor.Human, update });
      authors.filter((other) => other !== author).forEach((other) => Y.applyUpdate(other, update, REMOTE_ORIGIN));
    }),
  );
  Array.from({ length: UPDATES }).forEach((_, index) => {
    const text = authors[index % 2]!.getText('t');
    if (index % 7 === 6) text.delete(0, 1);
    if (index % 7 !== 6) text.insert(text.length, String.fromCharCode(97 + (index % 26)));
  });
  return { log, close: () => sqlite.close() };
}

test('snapshot + tail materializes exactly the same state as a full replay at every sequence', () => {
  const { log, close } = seededLog();
  const written = compact({ log, documentName: DOCUMENT, everyUpdates: SNAPSHOT_EVERY });
  expect(written).toHaveLength(Math.floor(UPDATES / SNAPSHOT_EVERY));
  const updates = log.read({ documentName: DOCUMENT, untilSequence: Number.MAX_SAFE_INTEGER });
  updates.forEach((update) => {
    const fromSnapshot = materialize({ log, documentName: DOCUMENT, untilSequence: update.sequence });
    const fromScratch = replay(updates.filter((candidate) => candidate.sequence <= update.sequence));
    expect(fromSnapshot.getText('t').toString()).toBe(fromScratch.getText('t').toString());
    expect(Y.encodeStateVector(fromSnapshot)).toEqual(Y.encodeStateVector(fromScratch));
  });
  close();
});

test('compaction is idempotent', () => {
  const { log, close } = seededLog();
  compact({ log, documentName: DOCUMENT, everyUpdates: SNAPSHOT_EVERY });
  expect(compact({ log, documentName: DOCUMENT, everyUpdates: SNAPSHOT_EVERY })).toEqual([]);
  close();
});
