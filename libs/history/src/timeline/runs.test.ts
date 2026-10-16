import { MINUTE_MS } from '@superdoc-history/types';
import { expect, test } from 'vitest';
import type { EditRun, TimelineEvent } from './runs';
import { authorKey, filterRuns, groupIntoRuns } from './runs';

const BIN_MS = MINUTE_MS;

function typed({ text, author, blockId, startTime }: { text: string; author: string; blockId: string; startTime: number }): TimelineEvent[] {
  return [...text].map((character, index) => ({ sequence: startTime + index, serverTime: startTime + index, blockId, bandId: blockId, authorKeys: [author], inserted: character, deleted: '' }));
}

function runOf({ author, inserted, deleted }: { author: string; inserted: string; deleted: string }): EditRun {
  return { binStart: 0, blockId: author, bandId: author, authorKeys: [author], inserted, deleted, firstServerTime: 0, lastServerTime: 0, lastSequence: 0 };
}

test('keystrokes of one author in one block and bin join into one run', () => {
  const runs = groupIntoRuns({ events: [...typed({ text: 'budget', author: 'ana', blockId: 'b1', startTime: 0 }), ...typed({ text: 'hire', author: 'bruno', blockId: 'b2', startTime: 100 })], binMs: BIN_MS });
  expect(runs.map((run) => [run.authorKeys, run.inserted])).toEqual([[['ana'], 'budget'], [['bruno'], 'hire']]);
});

test('a term with regex metacharacters matches literally', () => {
  const runs = groupIntoRuns({ events: [...typed({ text: 'cost a.b*( up', author: 'ana', blockId: 'b1', startTime: 0 }), ...typed({ text: 'aXbb', author: 'ana', blockId: 'b2', startTime: 50 })], binMs: BIN_MS });
  expect(filterRuns({ runs, term: 'a.b*(', authorKeys: null }).map((run) => run.blockId)).toEqual(['b1']);
  expect(filterRuns({ runs, term: '[', authorKeys: null })).toEqual([]);
});

test('matching is case-insensitive and finds backspaced deletions', () => {
  const runs = [runOf({ author: 'ana', inserted: '', deleted: 'tegdub' }), runOf({ author: 'bruno', inserted: 'budget', deleted: '' })];
  expect(filterRuns({ runs, term: 'Budget', authorKeys: null })).toHaveLength(2);
  expect(filterRuns({ runs, term: 'Budget', authorKeys: new Set(['bruno']) }).map((run) => run.authorKeys)).toEqual([['bruno']]);
  expect(authorKey({ id: null, name: 'Chris Crawford' })).toBe('imported:Chris Crawford');
});
