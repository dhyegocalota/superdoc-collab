import { ClientActor, DAY_MS, MINUTE_MS } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import type { EditRun, TimelineEvent } from './runs';
import { BIN_LADDER_MS } from './bins';
import { authorKey, filterRuns, groupIntoRuns, narrowRuns, runVolume } from './runs';

const BIN_MS = MINUTE_MS;
const UTC = 'UTC';
const SAO_PAULO = 'America/Sao_Paulo';

function typed({
  text,
  author,
  blockId,
  startTime,
}: {
  text: string;
  author: string;
  blockId: string;
  startTime: number;
}): TimelineEvent[] {
  return [...text].map((character, index) => ({
    sequence: startTime + index,
    serverTime: startTime + index,
    blockId,
    bandId: blockId,
    authorKeys: [author],
    inserted: character,
    deleted: '',
    commented: false,
  }));
}

function runOf({ author, inserted, deleted }: { author: string; inserted: string; deleted: string }): EditRun {
  return {
    binStart: 0,
    blockId: author,
    bandId: author,
    authorKeys: [author],
    inserted,
    deleted,
    commented: false,
    firstServerTime: 0,
    lastServerTime: 0,
    versionSequence: 0,
  };
}

test('keystrokes of one author in one block and bin join into one run', () => {
  const runs = groupIntoRuns({
    events: [
      ...typed({ text: 'budget', author: 'ana', blockId: 'b1', startTime: 0 }),
      ...typed({ text: 'hire', author: 'bruno', blockId: 'b2', startTime: 100 }),
    ],
    binMs: BIN_MS,
    timeZone: UTC,
  });
  expect(runs.map((run) => [run.authorKeys, run.inserted])).toEqual([
    [['ana'], 'budget'],
    [['bruno'], 'hire'],
  ]);
});

test('a run opens the version after its last inserting event, not after a later delete', () => {
  const [run] = groupIntoRuns({
    events: [
      { sequence: 10, serverTime: 0, blockId: 'b1', bandId: 'b1', authorKeys: ['ana'], inserted: 'Added', deleted: '', commented: false },
      { sequence: 11, serverTime: 1, blockId: 'b1', bandId: 'b1', authorKeys: ['ana'], inserted: ' edited', deleted: '', commented: false },
      {
        sequence: 12,
        serverTime: 2,
        blockId: 'b1',
        bandId: 'b1',
        authorKeys: ['ana'],
        inserted: '',
        deleted: 'Added edited',
        commented: false,
      },
    ],
    binMs: BIN_MS,
    timeZone: UTC,
  });
  expect(run!.versionSequence).toBe(11);
});

test('a comment never merges with an edit run of the same author, block and bin', () => {
  const runs = groupIntoRuns({
    events: [
      { sequence: 0, serverTime: 0, blockId: 'b1', bandId: 'b1', authorKeys: ['ana'], inserted: 'Added', deleted: '', commented: false },
      { sequence: 0, serverTime: 1, blockId: 'b1', bandId: 'b1', authorKeys: ['ana'], inserted: 'Cite it', deleted: '', commented: true },
    ],
    binMs: BIN_MS,
    timeZone: UTC,
  });
  expect(runs.map((run) => [run.inserted, run.commented])).toEqual([
    ['Added', false],
    ['Cite it', true],
  ]);
});

test('a run of only deletions opens the version after its last event', () => {
  const [run] = groupIntoRuns({
    events: [
      { sequence: 20, serverTime: 0, blockId: 'b1', bandId: 'b1', authorKeys: ['ana'], inserted: '', deleted: 'a', commented: false },
      { sequence: 21, serverTime: 1, blockId: 'b1', bandId: 'b1', authorKeys: ['ana'], inserted: '', deleted: 'b', commented: false },
    ],
    binMs: BIN_MS,
    timeZone: UTC,
  });
  expect(run!.versionSequence).toBe(21);
});

test('a term with regex metacharacters matches literally', () => {
  const runs = groupIntoRuns({
    events: [
      ...typed({ text: 'cost a.b*( up', author: 'ana', blockId: 'b1', startTime: 0 }),
      ...typed({ text: 'aXbb', author: 'ana', blockId: 'b2', startTime: 50 }),
    ],
    binMs: BIN_MS,
    timeZone: UTC,
  });
  expect(filterRuns({ runs, term: 'a.b*(', authorKeys: null }).map((run) => run.blockId)).toEqual(['b1']);
  expect(filterRuns({ runs, term: '[', authorKeys: null })).toEqual([]);
});

test('matching is case-insensitive and finds backspaced deletions', () => {
  const runs = [runOf({ author: 'ana', inserted: '', deleted: 'tegdub' }), runOf({ author: 'bruno', inserted: 'budget', deleted: '' })];
  expect(filterRuns({ runs, term: 'Budget', authorKeys: null })).toHaveLength(2);
  expect(filterRuns({ runs, term: 'Budget', authorKeys: new Set(['bruno']) }).map((run) => run.authorKeys)).toEqual([['bruno']]);
  expect(authorKey({ id: null, name: 'Chris Crawford', actor: ClientActor.Human })).toBe('imported:Chris Crawford');
});

function placed({ inserted, bandId, binStart }: { inserted: string; bandId: string; binStart: number }): EditRun {
  return { ...runOf({ author: 'ana', inserted, deleted: '' }), bandId, binStart };
}

const PLACED_RUNS = [
  placed({ inserted: 'a', bandId: 'budget', binStart: 0 }),
  placed({ inserted: 'b', bandId: 'budget', binStart: BIN_MS }),
  placed({ inserted: 'c', bandId: 'hiring', binStart: 0 }),
];

test('narrowing by band and bin keeps only the runs of that band in that bin', () => {
  expect(narrowRuns({ runs: PLACED_RUNS, bandId: 'budget', binStart: 0 }).map((run) => run.inserted)).toEqual(['a']);
  expect(narrowRuns({ runs: PLACED_RUNS, bandId: null, binStart: 0 }).map((run) => run.inserted)).toEqual(['a', 'c']);
  expect(narrowRuns({ runs: PLACED_RUNS, bandId: 'budget', binStart: null }).map((run) => run.inserted)).toEqual(['a', 'b']);
  expect(narrowRuns({ runs: PLACED_RUNS, bandId: null, binStart: null })).toEqual(PLACED_RUNS);
});

test('narrowing by a band or a bin nobody edited yields nothing', () => {
  expect(narrowRuns({ runs: PLACED_RUNS, bandId: 'gone', binStart: null })).toEqual([]);
  expect(narrowRuns({ runs: PLACED_RUNS, bandId: null, binStart: 7 * BIN_MS })).toEqual([]);
});

test('runVolume counts inserted and deleted characters', () => {
  expect(runVolume({ inserted: 'ab', deleted: 'c' })).toBe(3);
});

test.each([
  [{ id: 'ana', name: 'Ana', actor: ClientActor.Human }, 'ana'],
  [{ id: 'ana', name: 'Ana · AI', actor: ClientActor.Agent }, 'ana#agent'],
  [{ id: null, name: 'Chris Crawford', actor: ClientActor.Human }, 'imported:Chris Crawford'],
])('the author key of %o is %s', (author, expected) => {
  expect(authorKey(author)).toBe(expected);
});

test('day runs split at the reader local midnight, not at UTC midnight', () => {
  const beforeLocalMidnight = Date.UTC(2026, 9, 17, 2, 59);
  const afterLocalMidnight = Date.UTC(2026, 9, 17, 3, 0);
  const events = [beforeLocalMidnight, afterLocalMidnight].flatMap((startTime) =>
    typed({ text: 'x', author: 'ana', blockId: 'b1', startTime }),
  );
  const inSaoPaulo = groupIntoRuns({ events, binMs: DAY_MS, timeZone: SAO_PAULO });
  const inUtc = groupIntoRuns({ events, binMs: DAY_MS, timeZone: UTC });
  expect(inSaoPaulo.map((run) => run.binStart)).toEqual([Date.UTC(2026, 9, 16, 3, 0), Date.UTC(2026, 9, 17, 3, 0)]);
  expect(inUtc.map((run) => run.binStart)).toEqual([Date.UTC(2026, 9, 17, 0, 0)]);
});

const PRE_EPOCH_TIMES = [Date.UTC(1900, 0, 1), Date.UTC(1969, 11, 31, 23, 59), Date.UTC(1971, 5, 1)];
const PRE_EPOCH_ZONES = [UTC, SAO_PAULO, 'Asia/Kolkata', 'Pacific/Apia'];

test('events before 1970 group into runs that contain them for every ladder size and zone', () => {
  const events = PRE_EPOCH_TIMES.flatMap((startTime) => typed({ text: 'x', author: 'ana', blockId: 'b1', startTime }));
  PRE_EPOCH_ZONES.forEach((timeZone) =>
    BIN_LADDER_MS.forEach((binMs) => {
      const runs = groupIntoRuns({ events, binMs, timeZone });
      expect(runs.length).toBeGreaterThanOrEqual(1);
      expect(runs.every((run) => run.binStart <= run.firstServerTime)).toBe(true);
    }),
  );
});
