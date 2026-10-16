import type { EditRunView } from '@superdoc-history/types';
import { expect, expectTypeOf, test, vi } from 'vitest';
import { HIGHLIGHT_COMMENT_TEXT } from './editor-copy';
import { clearHighlights, highlightEdits, highlightTargets, MAX_HIGHLIGHTS, MIN_HIGHLIGHT_CHARACTERS, TEXT_BLOCK_NODE_TYPES, type EditorDocument } from './highlight-edits';

type MatchCounts = Record<string, Partial<Record<(typeof TEXT_BLOCK_NODE_TYPES)[number], number>>>;

function run({ blockId, inserted = '', deleted = '' }: { blockId: string; inserted?: string; deleted?: string }): EditRunView {
  return { blockId, bandId: 'band-0', authorKeys: ['ana'], inserted, deleted, lastServerTime: 1 };
}

function stubDocument(counts: Record<string, MatchCounts[string]>, patternByBlock: Record<string, string>) {
  const matchCalls: { select: { pattern: string; mode: string }; within?: { kind: string; nodeType: string; nodeId: string } }[] = [];
  const created: { text: string; target: unknown }[] = [];
  const deleted: string[] = [];
  const document = {
    query: {
      match: vi.fn(async (input: (typeof matchCalls)[number]) => {
        matchCalls.push(input);
        const { within } = input;
        if (!within || patternByBlock[within.nodeId] !== input.select.pattern) throw new Error(`unexpected match ${JSON.stringify(input)}`);
        const count = counts[within.nodeId]![within.nodeType as keyof MatchCounts[string]]!;
        return { items: Array.from({ length: count }, (_, index) => ({ matchKind: 'text', target: { nodeId: within.nodeId, index } })) };
      }),
    },
    comments: {
      create: vi.fn((input: { text: string; target: unknown }) => {
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

test('the comment and match APIs keep the shape the highlighter relies on', () => {
  expectTypeOf<Parameters<EditorDocument['query']['match']>[0]>().toMatchTypeOf<{
    select: { type: 'text'; pattern: string; mode?: 'contains' | 'regex' };
    within?: { kind: 'block'; nodeType: 'paragraph' | 'heading' | 'listItem'; nodeId: string };
  }>();
  expectTypeOf<Parameters<EditorDocument['comments']['create']>[0]>().toMatchTypeOf<{ text: string; target?: unknown }>();
  expectTypeOf<Parameters<EditorDocument['comments']['delete']>[0]>().toEqualTypeOf<{ commentId: string }>();
});

test('each inserted run gets one local comment per match inside its own block', async () => {
  const { document, matchCalls, created } = stubDocument(
    { b2: { paragraph: 1, heading: 0, listItem: 0 }, b3: { paragraph: 0, heading: 2, listItem: 0 } },
    { b2: 'a designer', b3: 'more money' },
  );
  const runs = [run({ blockId: 'b1', inserted: ' a' }), run({ blockId: 'b2', inserted: ' a designer' }), run({ blockId: 'b2', inserted: ' a designer' }), run({ blockId: 'b3', inserted: 'more money' }), run({ blockId: 'b4', deleted: 'gone text' })];
  const result = await highlightEdits({ document, runs });
  expect(result.commentIds).toEqual(['c1', 'c2', 'c3']);
  expect(created.map((comment) => comment.text)).toEqual([HIGHLIGHT_COMMENT_TEXT, HIGHLIGHT_COMMENT_TEXT, HIGHLIGHT_COMMENT_TEXT]);
  expect(matchCalls.every((call) => call.within?.kind === 'block' && call.select.mode === 'contains')).toBe(true);
  expect(matchCalls.map((call) => call.within!.nodeId).sort()).toEqual(['b2', 'b2', 'b2', 'b3', 'b3', 'b3']);
  expect(result.skippedCount).toBe(0);
});

test('a run whose block has no match is skipped silently and counted', async () => {
  const { document } = stubDocument({ b2: { paragraph: 0, heading: 0, listItem: 0 } }, { b2: 'a designer' });
  const result = await highlightEdits({ document, runs: [run({ blockId: 'b2', inserted: 'a designer' })] });
  expect(result).toEqual({ commentIds: [], skippedCount: 1 });
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
  const { document, created } = stubDocument({ b1: { paragraph: MAX_HIGHLIGHTS + 10, heading: 0, listItem: 0 } }, { b1: 'repeated' });
  const result = await highlightEdits({ document, runs: [run({ blockId: 'b1', inserted: 'repeated' })] });
  expect(created).toHaveLength(MAX_HIGHLIGHTS);
  expect(result.commentIds).toHaveLength(MAX_HIGHLIGHTS);
});

test('clearing deletes every id exactly once', () => {
  const { document, deleted } = stubDocument({}, {});
  clearHighlights({ document, commentIds: ['c1', 'c2'] });
  expect(deleted).toEqual(['c1', 'c2']);
});
