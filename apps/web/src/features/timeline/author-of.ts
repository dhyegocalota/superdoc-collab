import type { EventAuthor } from '@superdoc-collab/types';

const NAME_SEPARATOR = ', ';

class MissingAuthorError extends Error {}

export function authorOf({ authors, authorKey }: { authors: Record<string, EventAuthor>; authorKey: string }): EventAuthor {
  const author = authors[authorKey];
  if (!author) throw new MissingAuthorError(authorKey);
  return author;
}

export function authorNames({ authors, authorKeys }: { authors: Record<string, EventAuthor>; authorKeys: string[] }): string {
  return authorKeys.map((authorKey) => authorOf({ authors, authorKey }).name).join(NAME_SEPARATOR);
}
