import type { Connection, Document, Hocuspocus } from '@hocuspocus/server';
import * as Y from 'yjs';
import { findBootstrapSequence, type ReadModel, type UpdateLog } from '@superdoc-collab/history';
import { RoomMode, SUPERSEDED_ATTEMPT_CLOSE_CODE, SUPERSEDED_ATTEMPT_REASON } from '@superdoc-collab/types';
import type { DocumentFileStorage } from '../documents/file-storage';
import type { TimelinePipelineCache } from '../history/timeline-pipeline-cache';
import type { InsightsServices } from '../http/app';
import type { VersionsService } from '../history/versions-service';
import type { VersionRooms } from './version-rooms';
import type { ProjectionScheduler } from '../history/projection-scheduler';
import type { CollaborationContext } from './collaboration-server';
import type { CreatorReservations } from './creator-reservations';
import { documentIdFromRoomName } from './room-name';

export const ROOM_MODE_SCAN_BATCH_SIZE = 100;

type AttemptContext = { creatorAttempt: number | null };

export type DocumentRuntime = {
  roomMode: (documentId: string) => RoomMode;
  reserveCreator: (parameters: { documentId: string; userId: string }) => number | null;
  onlineUserIds: (documentId: string) => Set<string>;
  importRevisions: (documentId: string) => void;
  forget: (documentId: string) => Promise<void>;
};

export function createCollaborationRuntime({
  hocuspocus,
  updateLog,
  readModel,
  scheduler,
  storage,
  timelinePipelines,
  versions,
  versionRooms,
  insights,
  reservations,
}: {
  hocuspocus: Hocuspocus;
  updateLog: UpdateLog;
  readModel: ReadModel;
  scheduler: ProjectionScheduler;
  storage: DocumentFileStorage;
  timelinePipelines: TimelinePipelineCache;
  versions: VersionsService;
  versionRooms: VersionRooms;
  insights: InsightsServices;
  reservations: CreatorReservations;
}): DocumentRuntime {
  const bootstrapped = new Set<string>();
  function roomsOf(documentId: string): Document[] {
    return [...hocuspocus.documents.values()].filter((room) => documentIdFromRoomName(room.name) === documentId);
  }
  function connectionsOf(documentId: string): Connection[] {
    return roomsOf(documentId).flatMap((room) => [...room.connections.values()].map(({ connection }) => connection));
  }
  function findCommittedBootstrap({
    documentId,
    afterSequence,
    document,
  }: {
    documentId: string;
    afterSequence: number;
    document: Y.Doc;
  }): number | null {
    const page = updateLog.readBatch({ documentName: documentId, afterSequence, limit: ROOM_MODE_SCAN_BATCH_SIZE });
    const last = page.at(-1);
    if (!last) return null;
    const found = findBootstrapSequence({ updates: page, document });
    if (found !== null) return found;
    return findCommittedBootstrap({ documentId, afterSequence: last.sequence, document });
  }
  function hasCommittedBootstrap(documentId: string): boolean {
    if (bootstrapped.has(documentId)) return true;
    const isProjected = readModel.cursor(documentId) !== null;
    const committed = isProjected || findCommittedBootstrap({ documentId, afterSequence: 0, document: new Y.Doc() }) !== null;
    if (committed) bootstrapped.add(documentId);
    return committed;
  }
  return {
    reserveCreator: ({ documentId, userId }) => {
      const attempt = reservations.reserve({ documentId, userId });
      if (attempt === null) return null;
      connectionsOf(documentId)
        .filter((connection) => (connection.context as AttemptContext).creatorAttempt !== attempt)
        .forEach((connection) => connection.close({ code: SUPERSEDED_ATTEMPT_CLOSE_CODE, reason: SUPERSEDED_ATTEMPT_REASON }));
      return attempt;
    },
    roomMode: (documentId) => (hasCommittedBootstrap(documentId) ? RoomMode.Join : RoomMode.Create),
    onlineUserIds: (documentId) =>
      new Set(connectionsOf(documentId).map((connection) => (connection.context as CollaborationContext).userId)),
    importRevisions: (documentId) => scheduler.importRevisions({ documentId, filePath: storage.pathOf(documentId) }),
    forget: async (documentId) => {
      roomsOf(documentId).forEach((room) => hocuspocus.closeConnections(room.name));
      updateLog.forget(documentId);
      bootstrapped.delete(documentId);
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
