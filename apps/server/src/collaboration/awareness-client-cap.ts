import type { Document } from '@hocuspocus/server';
import { MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION } from '@superdoc-collab/types';

type DocumentConnection = Document['connections'] extends Map<unknown, infer Entry> ? Entry : never;

// NB ADR 0040: a provider holds one awareness client id per connection, so a connection past the cap is closed before the declarer scans the room.
export function overfullConnections(document: Document): DocumentConnection[] {
  return [...document.connections.values()].filter(({ clients }) => clients.size > MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION);
}
