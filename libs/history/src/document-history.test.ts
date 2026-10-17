import * as Y from 'yjs';
import { expect, test } from 'vitest';
import { isBootstrapCommitted } from './document-history';

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
