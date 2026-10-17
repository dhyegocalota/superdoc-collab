import type { ClientActor, EventAuthor } from '@superdoc-collab/types';

class MissingAuthorError extends Error {}

export function authorOf({ authors, authorKey }: { authors: Record<string, EventAuthor>; authorKey: string }): EventAuthor {
  const author = authors[authorKey];
  if (!author) throw new MissingAuthorError(authorKey);
  return author;
}

export function authorNamed({
  authors,
  name,
  actor,
}: {
  authors: Record<string, EventAuthor>;
  name: string;
  actor: ClientActor;
}): EventAuthor {
  const author = Object.values(authors).find((candidate) => candidate.name === name && candidate.actor === actor);
  if (!author) throw new MissingAuthorError(name);
  return author;
}
