import { BlockChangeKind } from '@superdoc-collab/types';
import type { ImportedRevision } from './read-model';

const COMMENT_REVISION_PREFIX = 'comment:';

export type ListedComment = {
  id: string;
  text?: string;
  creatorName?: string;
  createdTime?: number;
  parentCommentId?: string;
  trackedChange?: boolean;
  target?: { segments: { blockId: string }[] };
};

export class IncompleteCommentError extends Error {
  constructor({ commentId, field }: { commentId: string; field: string }) {
    super(`Comment ${commentId} has no ${field}.`);
  }
}

function require<Value>({ value, commentId, field }: { value: Value | undefined; commentId: string; field: string }): Value {
  if (value === undefined) throw new IncompleteCommentError({ commentId, field });
  return value;
}

function blockIdOf({ comment, byId }: { comment: ListedComment; byId: Map<string, ListedComment> }): string {
  const [segment] = comment.target ? comment.target.segments : [];
  if (segment) return segment.blockId;
  const parent = comment.parentCommentId === undefined ? undefined : byId.get(comment.parentCommentId);
  if (!parent) throw new IncompleteCommentError({ commentId: comment.id, field: 'target' });
  return blockIdOf({ comment: parent, byId });
}

export function toImportedComments(items: ListedComment[]): ImportedRevision[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return items
    .filter((item) => item.trackedChange !== true)
    .map((comment) => ({
      revisionId: `${COMMENT_REVISION_PREFIX}${comment.id}`,
      kind: BlockChangeKind.Commented,
      authorName: require({ value: comment.creatorName, commentId: comment.id, field: 'author' }),
      serverTime: require({ value: comment.createdTime, commentId: comment.id, field: 'date' }),
      blockId: blockIdOf({ comment, byId }),
      inserted: require({ value: comment.text, commentId: comment.id, field: 'text' }),
      deleted: '',
    }));
}
