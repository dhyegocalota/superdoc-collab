import type { Document } from '@hocuspocus/server';
import { POLICY_VIOLATION_CLOSE_CODE, SOCKET_AWARENESS_ORIGIN_REASON } from '@superdoc-collab/types';

type AwarenessChange = { added: number[]; updated: number[]; removed: number[] };

// NB ADR 0040: Hocuspocus files a replayed or reconnected id under updated, so ids no connection holds join the sender and leave with it, and a sender touching an id another connection holds is closed.
export function closeSendersOfForeignIds(document: Document): void {
  document.awareness.on('update', ({ updated, removed }: AwarenessChange, origin: unknown) => {
    const members = [...document.connections.values()];
    const sender = members.find(({ connection }) => connection.webSocket === origin);
    if (sender === undefined) return;
    const others = members.filter((member) => member !== sender);
    const isHeldByOthers = (clientId: number) => others.some(({ clients }) => clients.has(clientId));
    const unownedUpdates = updated.filter((clientId) => !sender.clients.has(clientId));
    unownedUpdates.filter((clientId) => !isHeldByOthers(clientId)).forEach((clientId) => sender.clients.add(clientId));
    const foreignIds = [...unownedUpdates, ...removed].filter(isHeldByOthers);
    if (foreignIds.length === 0) return;
    sender.connection.close({ code: POLICY_VIOLATION_CLOSE_CODE, reason: SOCKET_AWARENESS_ORIGIN_REASON });
  });
}
