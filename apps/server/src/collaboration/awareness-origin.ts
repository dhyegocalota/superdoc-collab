import type { Document } from '@hocuspocus/server';
import { MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION } from '@superdoc-collab/types';
import { AwarenessOwners } from './awareness-owners';
import type { CollaborationContext } from './collaboration-context';
import type { DocumentConnection } from './document-connection';

type AwarenessChange = { added: number[]; updated: number[] };

function userIdOf({ connection }: DocumentConnection): string {
  return (connection.context as CollaborationContext).userId;
}

function holdersOf({ others, clientId }: { others: DocumentConnection[]; clientId: number }): DocumentConnection[] {
  return others.filter(({ clients }) => clients.has(clientId));
}

// NB ADR 0040: every id a connection adds or takes over is bound to its user, an id held by the same user's other socket moves to the sender, and an id held by another user stays where it is.
export function trackAwarenessOwners({ document, owners }: { document: Document; owners: AwarenessOwners }): void {
  document.awareness.on('update', ({ added, updated }: AwarenessChange, origin: unknown) => {
    const members = [...document.connections.values()];
    const sender = members.find(({ connection }) => connection.webSocket === origin);
    if (sender === undefined) return;
    const others = members.filter((member) => member !== sender);
    const movable = updated
      .filter((clientId) => !sender.clients.has(clientId))
      .map((clientId) => ({ clientId, holders: holdersOf({ others, clientId }) }))
      .filter(({ holders }) => holders.every((holder) => userIdOf(holder) === userIdOf(sender)));
    movable.forEach(({ clientId, holders }) => {
      holders.forEach(({ clients }) => clients.delete(clientId));
      sender.clients.add(clientId);
    });
    const isOverCap = sender.clients.size > MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION;
    if (isOverCap) return;
    owners.bind({
      documentName: document.name,
      clientIds: [...added, ...movable.map(({ clientId }) => clientId)],
      userId: userIdOf(sender),
      isHeld: (clientId) => members.some(({ clients }) => clients.has(clientId)),
    });
  });
}
