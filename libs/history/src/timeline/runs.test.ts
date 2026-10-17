import { ClientActor, MINUTE_MS } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import type { EditRun, TimelineEvent } from './runs';
import { authorKey, filterRuns, groupIntoRuns, narrowRuns, runVolume } from './runs';

const BIN_MS = MINUTE_MS;

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
    firstServerTime: 0,
    lastServerTime: 0,
    lastSequence: 0,
  };
}

test('keystrokes of one author in one block and bin join into one run', () => {
  const runs = groupIntoRuns({
    events: [
      ...typed({ text: 'budget', author: 'ana', blockId: 'b1', startTime: 0 }),
      ...typed({ text: 'hire', author: 'bruno', blockId: 'b2', startTime: 100 }),
    ],
    binMs: BIN_MS,
  });
  expect(runs.map((run) => [run.authorKeys, run.inserted])).toEqual([
    [['ana'], 'budget'],
    [['bruno'], 'hire'],
  ]);
});

test('a term with regex metacharacters matches literally', () => {
  const runs = groupIntoRuns({
    events: [
      ...typed({ text: 'cost a.b*( up', author: 'ana', blockId: 'b1', startTime: 0 }),
      ...typed({ text: 'aXbb', author: 'ana', blockId: 'b2', startTime: 50 }),
    ],
    binMs: BIN_MS,
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
