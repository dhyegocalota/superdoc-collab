import type { Document } from '@hocuspocus/server';
import { POLICY_VIOLATION_CLOSE_CODE, SOCKET_AWARENESS_ORIGIN_REASON } from '@superdoc-collab/types';
import { AwarenessOwners } from './awareness-owners';
import type { CollaborationContext } from './collaboration-context';
import type { DocumentConnection } from './document-connection';

export const AWARENESS_ORIGIN_LOG = 'Collaboration socket closed for updating an awareness client another connection holds';

export class AwarenessOriginError extends Error {
  readonly code = POLICY_VIOLATION_CLOSE_CODE;
  readonly reason = SOCKET_AWARENESS_ORIGIN_REASON;

  constructor() {
    super(SOCKET_AWARENESS_ORIGIN_REASON);
  }
}

type AwarenessChange = { added: number[]; updated: number[] };

function userIdOf({ connection }: DocumentConnection): string {
  return (connection.context as CollaborationContext).userId;
}

function holdersOf({ others, clientId }: { others: DocumentConnection[]; clientId: number }): DocumentConnection[] {
  return others.filter(({ clients }) => clients.has(clientId));
}

// NB ADR 0040: ids a sender does not hold move to it from the same user's other sockets, an update of an id another user holds closes it, and a removal never does because a reconnecting provider relays its peers' removals.
export function closeSendersOfForeignIds({ document, owners }: { document: Document; owners: AwarenessOwners }): void {
  document.awareness.on('update', ({ added, updated }: AwarenessChange, origin: unknown) => {
    const members = [...document.connections.values()];
    const sender = members.find(({ connection }) => connection.webSocket === origin);
    if (sender === undefined) return;
    owners.bind({ documentName: document.name, clientIds: added, userId: userIdOf(sender) });
    const others = members.filter((member) => member !== sender);
    const claims = updated
      .filter((clientId) => !sender.clients.has(clientId))
      .map((clientId) => ({ clientId, holders: holdersOf({ others, clientId }) }));
    const isHeldByAnotherUser = claims.some(({ holders }) => holders.some((holder) => userIdOf(holder) !== userIdOf(sender)));
    if (isHeldByAnotherUser) {
      console.warn(AWARENESS_ORIGIN_LOG);
      sender.connection.close({ code: POLICY_VIOLATION_CLOSE_CODE, reason: SOCKET_AWARENESS_ORIGIN_REASON });
      return;
    }
    claims.forEach(({ clientId, holders }) => {
      holders.forEach(({ clients }) => clients.delete(clientId));
      sender.clients.add(clientId);
    });
  });
}
