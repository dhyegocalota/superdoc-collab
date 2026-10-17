import { resolveAuthorIds, type ClientBinding, type StoredEditEvent, type UpdateLog } from '@superdoc-collab/history';
import { ClientActor, type DocumentEditEvent, type EventAuthor } from '@superdoc-collab/types';
import type { DocumentsRepository } from '../documents/documents-repository';

export type ResolvedEventsServices = {
  updateLog: Pick<UpdateLog, 'clientIdentities'>;
  documents: Pick<DocumentsRepository, 'userNames'>;
};

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

function authorBindingsOf({ event, identities }: { event: StoredEditEvent; identities: Map<number, ClientBinding> }): ClientBinding[] {
  const { yjsClientIds, connectionUserId, connectionActor } = event;
  if (event.imported) return [];
  if (yjsClientIds === null || connectionUserId === null) throw new IncompleteEditEventError(event.id);
  return resolveAuthorIds({ update: { yjsClientIds, connectionUserId, connectionActor }, identities });
}

function authorsOf({
  event,
  bindings,
  names,
}: {
  event: StoredEditEvent;
  bindings: ClientBinding[];
  names: Map<string, string>;
}): EventAuthor[] {
  if (event.authorName !== null) return [{ id: null, name: event.authorName, actor: ClientActor.Human }];
  return bindings.map(({ userId, actor }) => {
    const name = names.get(userId);
    if (!name) throw new UnknownAuthorError(userId);
    return { id: userId, name, actor };
  });
}

export function resolveEvents({
  services,
  documentId,
  stored,
}: {
  services: ResolvedEventsServices;
  documentId: string;
  stored: StoredEditEvent[];
}): DocumentEditEvent[] {
  const identities = services.updateLog.clientIdentities(documentId);
  const resolved = stored.map((event) => ({ event, bindings: authorBindingsOf({ event, identities }) }));
  const names = services.documents.userNames([...new Set(resolved.flatMap(({ bindings }) => bindings.map(({ userId }) => userId)))]);
  return resolved.map(({ event, bindings }) => ({
    id: event.id,
    sequence: event.sequence,
    serverTime: event.serverTime,
    blockId: event.blockId,
    kind: event.kind,
    inserted: event.inserted,
    deleted: event.deleted,
    imported: event.imported,
    authors: authorsOf({ event, bindings, names }),
  }));
}
