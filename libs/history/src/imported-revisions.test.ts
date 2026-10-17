import { expect, test } from 'vitest';
import { MissingTrackedChangeTextError, TrackedChangeType, toImportedRevisions, type ListedTrackedChange } from './imported-revisions';

const INSERTION: ListedTrackedChange = {
  id: 'r1',
  type: TrackedChangeType.Insertion,
  author: 'Ana Souza',
  date: '2026-03-01T18:30:00Z',
  insertedText: ' GDPR clause',
  deletedText: null,
  imported: true,
  navigationTarget: { blockId: '00000002' },
};

test('maps a listed insertion to an imported revision', () => {
  expect(toImportedRevisions([INSERTION])).toEqual([
    {
      revisionId: 'r1',
      authorName: 'Ana Souza',
      serverTime: Date.parse('2026-03-01T18:30:00Z'),
      blockId: '00000002',
      inserted: ' GDPR clause',
      deleted: '',
    },
  ]);
});

test('a deletion without its deleted text throws', () => {
  const deletion: ListedTrackedChange = { ...INSERTION, id: 'r2', type: TrackedChangeType.Deletion, insertedText: null };
  expect(() => toImportedRevisions([deletion])).toThrow(MissingTrackedChangeTextError);
});
