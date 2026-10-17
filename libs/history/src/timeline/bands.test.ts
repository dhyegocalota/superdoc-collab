import { TimelineBandKind } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { buildBands, byVolumeDescending, contributorsByBand } from './bands';
import type { EditRun } from './runs';

function runOf({
  bandId,
  authorKey,
  inserted,
  firstServerTime,
}: {
  bandId: string;
  authorKey: string;
  inserted: string;
  firstServerTime: number;
}): EditRun {
  return {
    binStart: 0,
    blockId: bandId,
    bandId,
    authorKeys: [authorKey],
    inserted,
    deleted: '',
    firstServerTime,
    lastServerTime: firstServerTime,
    lastSequence: firstServerTime,
  };
}

test('hues follow onset from cool to warm and Other has none', () => {
  const identities = [
    { id: 'b30', kind: TimelineBandKind.Topic, name: 'Third' },
    { id: 'b10', kind: TimelineBandKind.Topic, name: 'First' },
    { id: 'b20', kind: TimelineBandKind.Topic, name: 'Second' },
    { id: 'other', kind: TimelineBandKind.Other, name: 'Other' },
  ];
  const runs = identities.map((identity, index) =>
    runOf({ bandId: identity.id, authorKey: 'ana', inserted: 'x', firstServerTime: [30, 10, 20, 40][index]! }),
  );
  const bands = buildBands({ identities, allRuns: runs, matchedRuns: runs });
  expect(Object.fromEntries(bands.map((band) => [band.id, band.hue]))).toEqual({ b10: 205, b20: 115, b30: 25, other: null });
  const alone = buildBands({ identities: [identities[0]!], allRuns: [runs[0]!], matchedRuns: [runs[0]!] });
  expect(alone[0]!.hue).toBe(205);
});

test('volume counts matched runs only, onset counts all runs', () => {
  const identities = [{ id: 'b1', kind: TimelineBandKind.Topic, name: 'Plan' }];
  const earliest = runOf({ bandId: 'b1', authorKey: 'ana', inserted: 'abcd', firstServerTime: 5 });
  const later = runOf({ bandId: 'b1', authorKey: 'ana', inserted: 'xy', firstServerTime: 50 });
  const [band] = buildBands({ identities, allRuns: [earliest, later], matchedRuns: [later] });
  expect(band!.onsetTime).toBe(5);
  expect(band!.volume).toBe(2);
});

test('contributors sort by characters', () => {
  const runs = [
    runOf({ bandId: 'b1', authorKey: 'ana', inserted: 'one two', firstServerTime: 1 }),
    runOf({ bandId: 'b1', authorKey: 'bruno', inserted: 'a b c d e f g h i j k l m n o p q r s t', firstServerTime: 2 }),
  ];
  const contributors = contributorsByBand(runs)['b1']!;
  expect(contributors.map((contributor) => contributor.authorKey)).toEqual(['bruno', 'ana']);
  expect(contributors[1]!.wordsInserted).toBe(2);
});

test('byVolumeDescending puts the largest contributor first and keeps ties in order', () => {
  const contributor = (authorKey: string, inserted: number) => ({ authorKey, inserted, deleted: 1, wordsInserted: 0, wordsDeleted: 0 });
  expect([contributor('a', 1), contributor('b', 5), contributor('c', 1)].sort(byVolumeDescending).map((each) => each.authorKey)).toEqual([
    'b',
    'a',
    'c',
  ]);
});
