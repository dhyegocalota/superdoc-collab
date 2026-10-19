import type { Document } from '@hocuspocus/server';
import { POLICY_VIOLATION_CLOSE_CODE, SOCKET_AWARENESS_ORIGIN_REASON } from '@superdoc-collab/types';

export const AWARENESS_ORIGIN_LOG = 'Collaboration socket closed for updating an awareness client another connection holds';

type AwarenessChange = { updated: number[] };

// NB ADR 0040: ids no connection holds join the sender, an update of an id another connection holds closes it, and a removal of one never does because a reconnecting provider relays its peers' removals.
export function closeSendersOfForeignIds(document: Document): void {
  document.awareness.on('update', ({ updated }: AwarenessChange, origin: unknown) => {
    const members = [...document.connections.values()];
    const sender = members.find(({ connection }) => connection.webSocket === origin);
    if (sender === undefined) return;
    const others = members.filter((member) => member !== sender);
    const isHeldByOthers = (clientId: number) => others.some(({ clients }) => clients.has(clientId));
    const unownedUpdates = updated.filter((clientId) => !sender.clients.has(clientId));
    unownedUpdates.filter((clientId) => !isHeldByOthers(clientId)).forEach((clientId) => sender.clients.add(clientId));
    const foreignIds = unownedUpdates.filter(isHeldByOthers);
    if (foreignIds.length === 0) return;
    sender.connection.close({ code: POLICY_VIOLATION_CLOSE_CODE, reason: SOCKET_AWARENESS_ORIGIN_REASON });
  });
}
