import { BlockChangeKind } from '@superdoc-history/types';
import { expect, test, vi } from 'vitest';
import { MigrationSet } from './migrations';
import { ReadModel } from './read-model';
import { openTestDatabase } from './testing';

const DOCUMENT = 'read-model-room';
const FIRST_SEQUENCE = 1;
const SECOND_SEQUENCE = 2;

function editAt(sequence: number) {
  return { sequence, serverTime: sequence, blockId: 'block', kind: BlockChangeKind.Modified, inserted: 'x', deleted: '', yjsClientIds: [1], connectionUserId: 'ana' };
}

test('a batch committed between the two reads appears in neither the events nor the cursor', () => {
  const reader = new ReadModel(openTestDatabase({ set: MigrationSet.ReadModel }));
  const readerPath = (reader as unknown as { database: { name: string } }).database.name;
  const writer = new ReadModel(openTestDatabase({ set: MigrationSet.ReadModel, path: readerPath }));
  reader.commit({ documentName: DOCUMENT, events: [editAt(FIRST_SEQUENCE)], lastSequence: FIRST_SEQUENCE });
  const originalCursor = reader.cursor.bind(reader);
  vi.spyOn(reader, 'cursor').mockImplementation((documentName) => {
    const cursor = originalCursor(documentName);
    writer.commit({ documentName: DOCUMENT, events: [editAt(SECOND_SEQUENCE)], lastSequence: SECOND_SEQUENCE });
    return cursor;
  });
  const { events, cursor } = reader.readWithCursor({ documentName: DOCUMENT, afterSequence: null });
  expect(cursor).toBe(FIRST_SEQUENCE);
  expect(events.map((event) => event.sequence)).toEqual([FIRST_SEQUENCE]);
});
