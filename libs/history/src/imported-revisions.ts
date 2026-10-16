import type { ImportedRevision } from './read-model';

export enum TrackedChangeType {
  Insertion = 'insertion',
  Deletion = 'deletion',
}

export type ListedTrackedChange = { id: string; type: TrackedChangeType; author: string; date: string; insertedText: string | null; deletedText: string | null; imported: boolean; navigationTarget: { blockId: string } };

export class MissingTrackedChangeTextError extends Error {
  constructor(revisionId: string) {
    super(`Tracked change ${revisionId} has no text.`);
  }
}

function requireText({ text, revisionId }: { text: string | null; revisionId: string }): string {
  if (text === null) throw new MissingTrackedChangeTextError(revisionId);
  return text;
}

export function toImportedRevisions(items: ListedTrackedChange[]): ImportedRevision[] {
  return items.map((item) => {
    const isInsertion = item.type === TrackedChangeType.Insertion;
    const text = requireText({ text: isInsertion ? item.insertedText : item.deletedText, revisionId: item.id });
    return { revisionId: item.id, authorName: item.author, serverTime: Date.parse(item.date), blockId: item.navigationTarget.blockId, inserted: isInsertion ? text : '', deleted: isInsertion ? '' : text };
  });
}
