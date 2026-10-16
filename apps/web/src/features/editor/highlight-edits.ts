import type { EditRunView } from '@superdoc-history/types';
import type { SuperDoc } from 'superdoc';
import { HIGHLIGHT_COMMENT_TEXT } from './editor-copy';

export const MIN_HIGHLIGHT_CHARACTERS = 3;
export const MAX_HIGHLIGHTS = 50;
export const TEXT_BLOCK_NODE_TYPES = ['paragraph', 'heading', 'listItem'] as const;
const TEXT_MATCH_KIND = 'text';
const CONTAINS_MODE = 'contains';
const BLOCK_ADDRESS_KIND = 'block';

export type EditorDocument = NonNullable<NonNullable<SuperDoc['activeEditor']>['doc']>;
export type HighlightTarget = { blockId: string; pattern: string };
export type HighlightResult = { commentIds: string[]; skippedCount: number };

export function highlightTargets(runs: EditRunView[]): HighlightTarget[] {
  const targets = runs.map((run) => ({ blockId: run.blockId, pattern: run.inserted.trim() })).filter((target) => target.pattern.length >= MIN_HIGHLIGHT_CHARACTERS);
  const unique = new Map(targets.map((target) => [`${target.blockId}|${target.pattern}`, target]));
  return [...unique.values()].sort((left, right) => right.pattern.length - left.pattern.length);
}

async function matchInBlock({ document, target }: { document: EditorDocument; target: HighlightTarget }) {
  const outputs = await Promise.all(
    TEXT_BLOCK_NODE_TYPES.map((nodeType) =>
      document.query.match({ select: { type: 'text', pattern: target.pattern, mode: CONTAINS_MODE }, within: { kind: BLOCK_ADDRESS_KIND, nodeType, nodeId: target.blockId } }),
    ),
  );
  return outputs.flatMap((output) => output.items.filter((item) => item.matchKind === TEXT_MATCH_KIND).map((item) => item.target));
}

export async function highlightEdits({ document, runs }: { document: EditorDocument; runs: EditRunView[] }): Promise<HighlightResult> {
  const matched = await Promise.all(highlightTargets(runs).map((target) => matchInBlock({ document, target })));
  const receipts = await Promise.all(matched.flat().slice(0, MAX_HIGHLIGHTS).map((target) => document.comments.create({ text: HIGHLIGHT_COMMENT_TEXT, target })));
  const commentIds = receipts.flatMap((receipt) => (receipt.success ? [receipt.id] : []));
  return { commentIds, skippedCount: matched.filter((targets) => targets.length === 0).length };
}

export function clearHighlights({ document, commentIds }: { document: EditorDocument; commentIds: string[] }): void {
  commentIds.forEach((commentId) => document.comments.delete({ commentId }));
}
