import type { Connection, Hocuspocus } from '@hocuspocus/server';
import { ACCESS_REVOKED_CLOSE_CODE, ACCESS_REVOKED_REASON, type PublicViewer } from '@superdoc-collab/types';
import type { CollaborationContext } from './collaboration-context';
import { documentIdFromRoomName } from './room-name';

export type PublicConnections = { close: (documentId: string) => void; visitorsOf: (documentId: string) => PublicViewer[] };

type VisitorConnection = { connection: Connection; visitor: PublicViewer };

export function createPublicConnections({ hocuspocus }: { hocuspocus: Hocuspocus }): PublicConnections {
  function visitorConnectionsOf(documentId: string): VisitorConnection[] {
    return [...hocuspocus.documents.values()]
      .filter((room) => documentIdFromRoomName(room.name) === documentId)
      .flatMap((room) => [...room.connections.values()].map(({ connection }) => connection))
      .flatMap((connection) => {
        const { visitor } = connection.context as CollaborationContext;
        return visitor === null ? [] : [{ connection, visitor }];
      });
  }
  return {
    visitorsOf: (documentId) => [...new Map(visitorConnectionsOf(documentId).map(({ visitor }) => [visitor.id, visitor])).values()],
    close: (documentId) =>
      visitorConnectionsOf(documentId).forEach(({ connection }) =>
        connection.close({ code: ACCESS_REVOKED_CLOSE_CODE, reason: ACCESS_REVOKED_REASON }),
      ),
  };
}
