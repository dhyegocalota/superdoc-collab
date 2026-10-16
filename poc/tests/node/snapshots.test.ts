import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import { expect, test } from 'vitest';
import { UpdateLog, compact, materialize, replay } from '../../lib/update-log';

const DOCUMENT = 'snapshot-room';
const UPDATES = 250;
const SNAPSHOT_EVERY = 40;
const REMOTE_ORIGIN = 'remote';

function seededLog(): UpdateLog {
  const log = new UpdateLog(join(mkdtempSync(join(tmpdir(), 'poc-snap-')), 'history.sqlite'));
  const authors = [new Y.Doc(), new Y.Doc()];
  authors.forEach((author) => author.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE_ORIGIN) return;
    log.append({ documentName: DOCUMENT, connectionUserId: `user-${author.clientID}`, update });
    authors.filter((other) => other !== author).forEach((other) => Y.applyUpdate(other, update, REMOTE_ORIGIN));
  }));
  Array.from({ length: UPDATES }).forEach((_, index) => {
    const text = authors[index % 2].getText('t');
    if (index % 7 === 6) text.delete(0, 1);
    if (index % 7 !== 6) text.insert(text.length, String.fromCharCode(97 + (index % 26)));
  });
  return log;
}

test('snapshot + tail materializes exactly the same state as a full replay at every sequence', () => {
  const log = seededLog();
  const written = compact({ log, documentName: DOCUMENT, everyUpdates: SNAPSHOT_EVERY });
  expect(written).toHaveLength(Math.floor(UPDATES / SNAPSHOT_EVERY));
  const updates = log.read({ documentName: DOCUMENT, untilSequence: Number.MAX_SAFE_INTEGER });
  updates.forEach((update) => {
    const fromSnapshot = materialize({ log, documentName: DOCUMENT, untilSequence: update.sequence });
    const fromScratch = replay(updates.filter((candidate) => candidate.sequence <= update.sequence));
    expect(fromSnapshot.getText('t').toString()).toBe(fromScratch.getText('t').toString());
    expect(Y.encodeStateVector(fromSnapshot)).toEqual(Y.encodeStateVector(fromScratch));
  });
  log.close();
});

test('compaction is idempotent', () => {
  const log = seededLog();
  compact({ log, documentName: DOCUMENT, everyUpdates: SNAPSHOT_EVERY });
  expect(compact({ log, documentName: DOCUMENT, everyUpdates: SNAPSHOT_EVERY })).toEqual([]);
  log.close();
});
