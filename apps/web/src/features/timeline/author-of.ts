import { AGENT_NAME_SUFFIX, ClientActor, type EventAuthor } from '@superdoc-history/types';

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

export function actorOfName(name: string): ClientActor {
  if (name.endsWith(AGENT_NAME_SUFFIX)) return ClientActor.Agent;
  return ClientActor.Human;
}

export function humanNameOf(name: string): string {
  if (name.endsWith(AGENT_NAME_SUFFIX)) return name.slice(0, -AGENT_NAME_SUFFIX.length);
  return name;
}
