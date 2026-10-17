import { expect, test } from 'vitest';
import {
  InvalidRevisionDateError,
  MissingTrackedChangeTextError,
  TrackedChangeType,
  parseRevisionDate,
  toImportedRevisions,
  type ListedTrackedChange,
} from './imported-revisions';

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

test.each([
  ['2026-03-01T15:30:00-03:00', Date.UTC(2026, 2, 1, 18, 30)],
  ['2026-03-01T18:30:00Z', Date.UTC(2026, 2, 1, 18, 30)],
  ['2026-03-01T15:30:00+05:45', Date.UTC(2026, 2, 1, 9, 45)],
  ['2026-03-01T15:30:00', Date.UTC(2026, 2, 1, 15, 30)],
  ['2026-03-01T15:30:00.250', Date.UTC(2026, 2, 1, 15, 30, 0, 250)],
  ['2026-03-01 15:30:00', Date.UTC(2026, 2, 1, 15, 30)],
  ['2026-03-01 15:30:00-03:00', Date.UTC(2026, 2, 1, 18, 30)],
  ['1900-01-01T00:00:00Z', Date.UTC(1900, 0, 1)],
])('the revision date %s reads as %i whatever the process zone', (value, expected) => {
  expect(parseRevisionDate({ value, revisionId: 'r1' })).toBe(expected);
});

test('an unreadable revision date throws naming the revision', () => {
  expect(() => parseRevisionDate({ value: 'garbage', revisionId: 'r7' })).toThrow(InvalidRevisionDateError);
  expect(() => parseRevisionDate({ value: 'garbage', revisionId: 'r7' })).toThrow('r7');
});

test('a listed change without an offset in its date maps to UTC', () => {
  const [revision] = toImportedRevisions([{ ...INSERTION, date: '2026-03-01T15:30:00' }]);
  expect(revision?.serverTime).toBe(Date.UTC(2026, 2, 1, 15, 30));
});

test.each(['0001-01-01T00:00:00Z', '0099-06-01T00:00:00', '1899-12-31T23:59:59Z', '+275760-09-13T00:00:00Z', '+010000-01-01T00:00:00Z'])(
  'the revision date %s is outside the supported years and throws',
  (value) => {
    expect(() => parseRevisionDate({ value, revisionId: 'r3' })).toThrow(InvalidRevisionDateError);
  },
);
