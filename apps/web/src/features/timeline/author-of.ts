import type { EventAuthor } from '@superdoc-collab/types';

class MissingAuthorError extends Error {}

export function authorOf({ authors, authorKey }: { authors: Record<string, EventAuthor>; authorKey: string }): EventAuthor {
  const author = authors[authorKey];
  if (!author) throw new MissingAuthorError(authorKey);
  return author;
}
