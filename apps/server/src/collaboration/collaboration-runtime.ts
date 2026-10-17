import type { Connection, Document, Hocuspocus } from '@hocuspocus/server';
import type { UpdateLog } from '@superdoc-collab/history';
import { RoomMode, SUPERSEDED_ATTEMPT_CLOSE_CODE, SUPERSEDED_ATTEMPT_REASON } from '@superdoc-collab/types';
import type { DocumentFileStorage } from '../documents/file-storage';
import type { TimelinePipelineCache } from '../history/timeline-pipeline-cache';
import type { InsightsServices } from '../http/app';
import type { VersionsService } from '../history/versions-service';
import type { VersionRooms } from './version-rooms';
import type { ProjectionScheduler } from '../history/projection-scheduler';
import type { CollaborationContext } from './collaboration-context';
import type { BootstrapState } from './bootstrap-state';
import type { CreatorReservations, CreatorTicket } from './creator-reservations';
import { documentIdFromRoomName } from './room-name';

const TAKEOVER_CLOSE_LOG = 'Closed a socket superseded by a takeover';

export { ROOM_MODE_SCAN_BATCH_SIZE } from './bootstrap-state';

export type DocumentRuntime = {
  roomMode: (documentId: string) => RoomMode;
  reserveCreator: (parameters: { documentId: string; userId: string }) => CreatorTicket | null;
  onlineUserIds: (documentId: string) => Set<string>;
  importRevisions: (documentId: string) => void;
  forget: (documentId: string) => Promise<void>;
};

export function createCollaborationRuntime({
  hocuspocus,
  updateLog,
  scheduler,
  storage,
  timelinePipelines,
  versions,
  versionRooms,
  insights,
  reservations,
  bootstrap,
}: {
  hocuspocus: Hocuspocus;
  updateLog: UpdateLog;
  scheduler: ProjectionScheduler;
  storage: DocumentFileStorage;
  timelinePipelines: TimelinePipelineCache;
  versions: VersionsService;
  versionRooms: VersionRooms;
  insights: InsightsServices;
  reservations: CreatorReservations;
  bootstrap: BootstrapState;
}): DocumentRuntime {
  function roomsOf(documentId: string): Document[] {
    return [...hocuspocus.documents.values()].filter((room) => documentIdFromRoomName(room.name) === documentId);
  }
  function connectionsOf(documentId: string): Connection[] {
    return roomsOf(documentId).flatMap((room) => [...room.connections.values()].map(({ connection }) => connection));
  }
  return {
    reserveCreator: ({ documentId, userId }) => {
      const ticket = reservations.reserve({ documentId, userId });
      if (ticket === null) return null;
      connectionsOf(documentId)
        .filter((connection) => (connection.context as CollaborationContext).creatorAttempt !== ticket.attempt)
        .forEach((connection) => {
          console.warn(`${TAKEOVER_CLOSE_LOG} ${documentId} attempt ${(connection.context as CollaborationContext).creatorAttempt}`);
          connection.close({ code: SUPERSEDED_ATTEMPT_CLOSE_CODE, reason: SUPERSEDED_ATTEMPT_REASON });
        });
      return ticket;
    },
    roomMode: (documentId) => (bootstrap.isCommitted(documentId) ? RoomMode.Join : RoomMode.Create),
    onlineUserIds: (documentId) =>
      new Set(connectionsOf(documentId).map((connection) => (connection.context as CollaborationContext).userId)),
    importRevisions: (documentId) => scheduler.importRevisions({ documentId, filePath: storage.pathOf(documentId) }),
    forget: async (documentId) => {
      roomsOf(documentId).forEach((room) => hocuspocus.closeConnections(room.name));
      updateLog.forget(documentId);
      bootstrap.forget(documentId);
      reservations.forget(documentId);
      timelinePipelines.forget(documentId);
      versions.forget(documentId);
      await versionRooms.forget(documentId);
      await scheduler.forget(documentId);
      insights.topics.forget(documentId);
      insights.summaries.forget(documentId);
      insights.selection.forget(documentId);
    },
  };
}
