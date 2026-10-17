import { BlockChangeKind } from '@superdoc-collab/types';
import * as Y from 'yjs';
import { expect, test, vi } from 'vitest';
import { MigrationSet } from './migrations';
import { markOf } from './version-marks';
import { ReadModel } from './read-model';
import { openTestDatabase } from './testing';

const DOCUMENT = 'read-model-room';
const FIRST_SEQUENCE = 1;
const SECOND_SEQUENCE = 2;

function editAt(sequence: number, blockId = 'block') {
  return {
    sequence,
    serverTime: sequence,
    blockId,
    kind: BlockChangeKind.Modified,
    inserted: 'x',
    deleted: '',
    yjsClientIds: [1],
    connectionUserId: 'ana',
  };
}

test('a batch committed between the two reads appears in neither the events nor the cursor', () => {
  const reader = new ReadModel(openTestDatabase({ set: MigrationSet.ReadModel }));
  const readerPath = (reader as unknown as { database: { name: string } }).database.name;
  const writer = new ReadModel(openTestDatabase({ set: MigrationSet.ReadModel, path: readerPath }));
  reader.commit({ documentName: DOCUMENT, events: [editAt(FIRST_SEQUENCE)], marks: [], lastSequence: FIRST_SEQUENCE });
  const originalCursor = reader.cursor.bind(reader);
  vi.spyOn(reader, 'cursor').mockImplementation((documentName) => {
    const cursor = originalCursor(documentName);
    writer.commit({ documentName: DOCUMENT, events: [editAt(SECOND_SEQUENCE)], marks: [], lastSequence: SECOND_SEQUENCE });
    return cursor;
  });
  const { events, cursor } = reader.readWithCursor({ documentName: DOCUMENT, afterSequence: null });
  expect(cursor).toBe(FIRST_SEQUENCE);
  expect(events.map((event) => event.sequence)).toEqual([FIRST_SEQUENCE]);
});

const PAGE_SEQUENCES = [1, 1, 2, 3, 3, 3, 4];
const PAGE_LIMIT = 4;
const BOUNDARY_SEQUENCE = 3;

test('readPage ends on a sequence boundary', () => {
  const readModel = new ReadModel(openTestDatabase({ set: MigrationSet.ReadModel }));
  const events = PAGE_SEQUENCES.map((sequence, index) => editAt(sequence, `block-${index}`));
  readModel.commit({ documentName: DOCUMENT, events, marks: [], lastSequence: 4 });
  const first = readModel.readPage({ documentName: DOCUMENT, afterSequence: null, limit: PAGE_LIMIT });
  expect(first.events.map((event) => event.sequence)).toEqual([1, 1, 2, 3, 3, 3]);
  expect(first.nextAfterSequence).toBe(BOUNDARY_SEQUENCE);
  const second = readModel.readPage({ documentName: DOCUMENT, afterSequence: BOUNDARY_SEQUENCE, limit: PAGE_LIMIT });
  expect(second.events.map((event) => event.sequence)).toEqual([4]);
  expect(second.nextAfterSequence).toBeNull();
});

test('forget clears the marks', () => {
  const readModel = new ReadModel(openTestDatabase({ set: MigrationSet.ReadModel }));
  const mark = markOf({
    update: { sequence: 1, serverTime: 10 } as Parameters<typeof markOf>[0]['update'],
    document: new Y.Doc(),
    isBootstrap: true,
  });
  readModel.commit({ documentName: DOCUMENT, events: [], marks: [mark], lastSequence: 1 });
  expect(readModel.marks(DOCUMENT)).toHaveLength(1);
  readModel.forget(DOCUMENT);
  expect(readModel.marks(DOCUMENT)).toEqual([]);
});
