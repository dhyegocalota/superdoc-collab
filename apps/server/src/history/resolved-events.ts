import { resolveAuthorIds, type StoredEditEvent } from '@superdoc-history/history';
import type { DocumentEditEvent, EventAuthor } from '@superdoc-history/types';
import type { AppServices } from '../http/app';

export class IncompleteEditEventError extends Error {
  constructor(eventId: number) {
    super(`Edit event ${eventId} has no client ids or connection user.`);
  }
}

export class UnknownAuthorError extends Error {
  constructor(userId: string) {
    super(`Edit event author ${userId} is not a known user.`);
  }
}

function authorIdsOf({ event, identities }: { event: StoredEditEvent; identities: Map<number, string> }): string[] {
  const { yjsClientIds, connectionUserId } = event;
  if (event.imported) return [];
  if (yjsClientIds === null || connectionUserId === null) throw new IncompleteEditEventError(event.id);
  return resolveAuthorIds({ update: { yjsClientIds, connectionUserId }, identities });
}

function authorsOf({
  event,
  authorIds,
  names,
}: {
  event: StoredEditEvent;
  authorIds: string[];
  names: Map<string, string>;
}): EventAuthor[] {
  if (event.authorName !== null) return [{ id: null, name: event.authorName }];
  return authorIds.map((id) => {
    const name = names.get(id);
    if (!name) throw new UnknownAuthorError(id);
    return { id, name };
  });
}

export function resolveEvents({
  services,
  documentId,
  stored,
}: {
  services: AppServices;
  documentId: string;
  stored: StoredEditEvent[];
}): DocumentEditEvent[] {
  const identities = services.updateLog.clientIdentities(documentId);
  const resolved = stored.map((event) => ({ event, authorIds: authorIdsOf({ event, identities }) }));
  const names = services.documents.userNames([...new Set(resolved.flatMap(({ authorIds }) => authorIds))]);
  return resolved.map(({ event, authorIds }) => ({
    id: event.id,
    sequence: event.sequence,
    serverTime: event.serverTime,
    blockId: event.blockId,
    kind: event.kind,
    inserted: event.inserted,
    deleted: event.deleted,
    imported: event.imported,
    authors: authorsOf({ event, authorIds, names }),
  }));
}
