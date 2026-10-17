import type { EditRunView } from '@superdoc-collab/types';
import type { SuperDoc } from 'superdoc';
import { HIGHLIGHT_COMMENT_TEXT } from './editor-copy';

export const MIN_HIGHLIGHT_CHARACTERS = 3;
export const MAX_HIGHLIGHTS = 50;
export const HIGHLIGHT_EXTERNAL_ID_PREFIX = 'timeline-highlight';
const TEXT_MATCH_KIND = 'text';
const CONTAINS_MODE = 'contains';
const BLOCK_ADDRESS_KIND = 'block';
const BLOCK_NODE_TYPE = 'paragraph';

export type EditorDocument = NonNullable<NonNullable<SuperDoc['activeEditor']>['doc']>;
export type HighlightTarget = { blockId: string; pattern: string };
export type HighlightResult = { commentIds: string[]; skippedCount: number; targetCount: number };

export function highlightTargets(runs: EditRunView[]): HighlightTarget[] {
  const targets = runs
    .map((run) => ({ blockId: run.blockId, pattern: run.inserted.trim() }))
    .filter((target) => target.pattern.length >= MIN_HIGHLIGHT_CHARACTERS);
  const unique = new Map(targets.map((target) => [`${target.blockId}|${target.pattern}`, target]));
  return [...unique.values()].sort((left, right) => right.pattern.length - left.pattern.length);
}

async function matchInBlock({ document, target }: { document: EditorDocument; target: HighlightTarget }) {
  const output = await document.query.match({
    select: { type: TEXT_MATCH_KIND, pattern: target.pattern, mode: CONTAINS_MODE, caseSensitive: true },
    within: { kind: BLOCK_ADDRESS_KIND, nodeType: BLOCK_NODE_TYPE, nodeId: target.blockId },
  });
  return output.items.filter((item) => item.matchKind === TEXT_MATCH_KIND).map((item) => item.target);
}

export async function highlightEdits({ document, runs }: { document: EditorDocument; runs: EditRunView[] }): Promise<HighlightResult> {
  const targets = highlightTargets(runs);
  const settledMatches = await Promise.allSettled(targets.map((target) => matchInBlock({ document, target })));
  const matched = settledMatches.map((settled) => (settled.status === 'fulfilled' ? settled.value : []));
  const batchId = crypto.randomUUID();
  const settledReceipts = await Promise.allSettled(
    matched
      .flat()
      .slice(0, MAX_HIGHLIGHTS)
      .map((target, index) =>
        document.comments.create({
          text: HIGHLIGHT_COMMENT_TEXT,
          externalId: `${HIGHLIGHT_EXTERNAL_ID_PREFIX}-${batchId}-${index}`,
          target,
        }),
      ),
  );
  const commentIds = settledReceipts.flatMap((settled) =>
    settled.status === 'fulfilled' && settled.value.success ? [settled.value.id] : [],
  );
  return { commentIds, skippedCount: matched.filter((found) => found.length === 0).length, targetCount: targets.length };
}

export function clearHighlights({ document, commentIds }: { document: EditorDocument; commentIds: string[] }): void {
  commentIds.forEach((commentId) => document.comments.delete({ commentId }));
}
