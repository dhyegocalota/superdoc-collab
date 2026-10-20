import { expect, test } from 'vitest';
import * as Y from 'yjs';
import { rebaseRoomDocumentId } from './rebase-room-document-id';

const SOURCE_ID = '936c44fb-8c55-470b-8442-9142230afb59';
const TARGET_ID = 'ca9c5b19-691e-4a3c-9de3-1e57812b9e54';
const SHARD_SUFFIX = '::story::main:word_document.xml';
const PARAGRAPH = 'Hello';

function blankStateOf(documentId: string): Uint8Array {
  const document = new Y.Doc();
  document.getMap('meta').set('roomDocumentId', documentId);
  document.getMap('meta').set('bootstrapState', 'committed');
  document.getMap('shards').set(`${documentId}${SHARD_SUFFIX}`, { shardKind: 'story', bootstrapStatus: 'seeded' });
  document.getMap('content').set(`${documentId}${SHARD_SUFFIX}`, new Y.Text(PARAGRAPH));
  return Y.encodeStateAsUpdate(document);
}

function jsonOf(state: Uint8Array): string {
  const document = new Y.Doc();
  Y.applyUpdate(document, state);
  return JSON.stringify(['meta', 'shards', 'content'].map((name) => document.getMap(name).toJSON()));
}

test('a blank state captured for one document is rebased onto another so no key still names the first', () => {
  const rebased = rebaseRoomDocumentId({ state: blankStateOf(SOURCE_ID), documentId: TARGET_ID });
  expect(jsonOf(rebased)).not.toContain(SOURCE_ID);
  expect(jsonOf(rebased)).toBe(jsonOf(blankStateOf(TARGET_ID)));
});

test('a state already bound to the document is returned unchanged', () => {
  const state = blankStateOf(SOURCE_ID);
  expect(rebaseRoomDocumentId({ state, documentId: SOURCE_ID })).toEqual(state);
});

test('a state without a room document id is refused', () => {
  const document = new Y.Doc();
  document.getMap('meta').set('bootstrapState', 'committed');
  expect(() => rebaseRoomDocumentId({ state: Y.encodeStateAsUpdate(document), documentId: TARGET_ID })).toThrow(/room document id/);
});

test('an id of another length is refused because the encoded lengths would break', () => {
  expect(() => rebaseRoomDocumentId({ state: blankStateOf(SOURCE_ID), documentId: 'document-plan' })).toThrow(/length/);
});
