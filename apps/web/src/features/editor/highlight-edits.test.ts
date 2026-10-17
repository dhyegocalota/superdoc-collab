import type { EditRunView } from '@superdoc-history/types';
import { expect, test, vi } from 'vitest';
import { HIGHLIGHT_COMMENT_TEXT } from './editor-copy';
import {
  clearHighlights,
  HIGHLIGHT_EXTERNAL_ID_PREFIX,
  highlightEdits,
  highlightTargets,
  MAX_HIGHLIGHTS,
  MIN_HIGHLIGHT_CHARACTERS,
  type EditorDocument,
} from './highlight-edits';

type MatchInput = {
  select: { pattern: string; mode: string; caseSensitive: boolean; type: string };
  within: { kind: string; nodeId: string };
};
type CreateInput = { text: string; externalId: string; target: unknown };

function run({ blockId, inserted = '', deleted = '' }: { blockId: string; inserted?: string; deleted?: string }): EditRunView {
  return { blockId, bandId: 'band-0', authorKeys: ['ana'], inserted, deleted, lastServerTime: 1 };
}

function stubDocument({ matchesByBlock, failCreateAt = [] }: { matchesByBlock: Record<string, number>; failCreateAt?: number[] }) {
  const matchCalls: MatchInput[] = [];
  const created: CreateInput[] = [];
  const deleted: string[] = [];
  let createCalls = 0;
  const document = {
    query: {
      match: vi.fn(async (input: MatchInput) => {
        matchCalls.push(input);
        const count = matchesByBlock[input.within.nodeId];
        if (count === undefined) throw new Error('within-target-not-found');
        return {
          items: Array.from({ length: count }, (_, index) => ({ matchKind: 'text', target: { nodeId: input.within.nodeId, index } })),
        };
      }),
    },
    comments: {
      create: vi.fn(async (input: CreateInput) => {
        createCalls += 1;
        if (failCreateAt.includes(createCalls)) throw new Error('create failed');
        created.push(input);
        return { success: true, id: `c${created.length}` };
      }),
      delete: vi.fn(({ commentId }: { commentId: string }) => {
        deleted.push(commentId);
      }),
    },
  };
  return { document: document as unknown as EditorDocument, matchCalls, created, deleted };
}

test('each inserted run is matched once inside its own block and a stale block is skipped', async () => {
  const { document, matchCalls, created } = stubDocument({ matchesByBlock: { b2: 1, b3: 2 } });
  const runs = [
    run({ blockId: 'b1', inserted: ' a' }),
    run({ blockId: 'b2', inserted: ' a designer' }),
    run({ blockId: 'b2', inserted: ' a designer' }),
    run({ blockId: 'b3', inserted: 'more money' }),
    run({ blockId: 'b4', deleted: 'gone text' }),
    run({ blockId: 'b5', inserted: 'ghost text' }),
  ];
  const result = await highlightEdits({ document, runs });
  expect(result).toEqual({ commentIds: ['c1', 'c2', 'c3'], skippedCount: 1, targetCount: 3 });
  expect(matchCalls).toHaveLength(3);
  expect(
    matchCalls.every(
      (call) => call.within.kind === 'block' && call.select.mode === 'contains' && call.select.caseSensitive && call.select.type === 'text',
    ),
  ).toBe(true);
  expect(
    created.every((comment) => comment.text === HIGHLIGHT_COMMENT_TEXT && comment.externalId.startsWith(HIGHLIGHT_EXTERNAL_ID_PREFIX)),
  ).toBe(true);
  expect(new Set(created.map((comment) => comment.externalId)).size).toBe(3);
});

test('a comment that fails to create does not lose the ones that were created', async () => {
  const { document } = stubDocument({ matchesByBlock: { b1: 3 }, failCreateAt: [2] });
  const result = await highlightEdits({ document, runs: [run({ blockId: 'b1', inserted: 'repeated' })] });
  expect(result.commentIds).toEqual(['c1', 'c2']);
});

test('targets keep long enough inserted text once per block, longest first, never deleted text', () => {
  const targets = highlightTargets([
    run({ blockId: 'b1', inserted: ' ab ' }),
    run({ blockId: 'b1', inserted: 'abc' }),
    run({ blockId: 'b1', inserted: ' abc ' }),
    run({ blockId: 'b2', inserted: 'abc' }),
    run({ blockId: 'b3', inserted: 'a longer text' }),
    run({ blockId: 'b4', deleted: 'deleted text' }),
  ]);
  expect(MIN_HIGHLIGHT_CHARACTERS).toBe(3);
  expect(targets).toEqual([
    { blockId: 'b3', pattern: 'a longer text' },
    { blockId: 'b1', pattern: 'abc' },
    { blockId: 'b2', pattern: 'abc' },
  ]);
});

test('no more than the maximum number of comments are created', async () => {
  const { document, created } = stubDocument({ matchesByBlock: { b1: MAX_HIGHLIGHTS + 10 } });
  const result = await highlightEdits({ document, runs: [run({ blockId: 'b1', inserted: 'repeated' })] });
  expect(created).toHaveLength(MAX_HIGHLIGHTS);
  expect(result.commentIds).toHaveLength(MAX_HIGHLIGHTS);
});

test('clearing deletes every id exactly once', () => {
  const { document, deleted } = stubDocument({ matchesByBlock: {} });
  clearHighlights({ document, commentIds: ['c1', 'c2'] });
  expect(deleted).toEqual(['c1', 'c2']);
});
