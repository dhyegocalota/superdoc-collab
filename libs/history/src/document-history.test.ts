import * as Y from 'yjs';
import { expect, test } from 'vitest';
import { findCommittedSnapshot, isBootstrapCommitted } from './document-history';
import { MigrationSet } from './migrations';
import { openTestDatabase } from './testing';
import { UpdateLog } from './update-log';

const META_MAP = 'meta';
const BOOTSTRAP_STATE_KEY = 'bootstrapState';
const BOOTSTRAP_COMMITTED = 'committed';
const BOOTSTRAP_PENDING = 'pending';

test('isBootstrapCommitted is true only for a document whose meta marks the bootstrap committed', () => {
  const committed = new Y.Doc();
  committed.getMap(META_MAP).set(BOOTSTRAP_STATE_KEY, BOOTSTRAP_COMMITTED);
  const pending = new Y.Doc();
  pending.getMap(META_MAP).set(BOOTSTRAP_STATE_KEY, BOOTSTRAP_PENDING);
  expect(isBootstrapCommitted({ document: committed })).toBe(true);
  expect(isBootstrapCommitted({ document: pending })).toBe(false);
});

test('isBootstrapCommitted is false for a document with no meta marker', () => {
  expect(isBootstrapCommitted({ document: new Y.Doc() })).toBe(false);
});

const DOCUMENT = 'document-1';

function stateWith(bootstrapState: string | null): Uint8Array {
  const document = new Y.Doc();
  if (bootstrapState !== null) document.getMap(META_MAP).set(BOOTSTRAP_STATE_KEY, bootstrapState);
  return Y.encodeStateAsUpdate(document);
}

function logWithSnapshots(states: (string | null)[]): UpdateLog {
  const log = new UpdateLog(openTestDatabase({ set: MigrationSet.History }));
  states.forEach((bootstrapState, index) =>
    log.writeSnapshot({ documentName: DOCUMENT, sequence: index + 1, state: stateWith(bootstrapState) }),
  );
  return log;
}

test('findCommittedSnapshot answers the first snapshot whose state is committed', () => {
  const log = logWithSnapshots([null, BOOTSTRAP_PENDING, BOOTSTRAP_COMMITTED, BOOTSTRAP_COMMITTED]);
  expect(findCommittedSnapshot({ log, documentName: DOCUMENT })?.sequence).toBe(3);
});

test('findCommittedSnapshot answers null when no snapshot is committed', () => {
  const log = logWithSnapshots([null, BOOTSTRAP_PENDING]);
  expect(findCommittedSnapshot({ log, documentName: DOCUMENT })).toBeNull();
});
