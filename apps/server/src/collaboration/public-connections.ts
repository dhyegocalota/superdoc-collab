import type { Hocuspocus } from '@hocuspocus/server';
import { ACCESS_REVOKED_CLOSE_CODE, ACCESS_REVOKED_REASON, type PublicViewer } from '@superdoc-collab/types';
import type { CollaborationContext } from './collaboration-context';
import { documentIdFromRoomName } from './room-name';

export type PublicConnections = { close: (documentId: string) => void; visitorsOf: (documentId: string) => PublicViewer[] };

export function createPublicConnections({ hocuspocus }: { hocuspocus: Hocuspocus }): PublicConnections {
  return {
    visitorsOf: (documentId) => {
      throw new Error(`visitorsOf is not implemented for ${documentId}`);
    },
    close: (documentId) =>
      [...hocuspocus.documents.values()]
        .filter((room) => documentIdFromRoomName(room.name) === documentId)
        .flatMap((room) => [...room.connections.values()].map(({ connection }) => connection))
        .filter((connection) => (connection.context as CollaborationContext).visitor !== null)
        .forEach((connection) => connection.close({ code: ACCESS_REVOKED_CLOSE_CODE, reason: ACCESS_REVOKED_REASON })),
  };
}
