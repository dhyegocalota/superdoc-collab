import type { Document, Hocuspocus } from '@hocuspocus/server';
import * as Y from 'yjs';
import { findBootstrapSequence, type ReadModel, type UpdateLog } from '@superdoc-history/history';
import { RoomMode } from '@superdoc-history/types';
import type { DocumentFileStorage } from '../documents/file-storage';
import type { TimelinePipelineCache } from '../history/timeline-pipeline-cache';
import type { InsightsServices } from '../http/app';
import type { VersionsService } from '../history/versions-service';
import type { VersionRooms } from './version-rooms';
import type { ProjectionScheduler } from '../history/projection-scheduler';
import type { CollaborationContext } from './collaboration-server';
import { documentIdFromRoomName } from './room-name';

export const ROOM_MODE_SCAN_BATCH_SIZE = 100;

export type DocumentRuntime = {
  roomMode: (documentId: string) => RoomMode;
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
}): DocumentRuntime {
  const bootstrapped = new Set<string>();
  function roomsOf(documentId: string): Document[] {
    return [...hocuspocus.documents.values()].filter((room) => documentIdFromRoomName(room.name) === documentId);
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
    roomMode: (documentId) => (hasCommittedBootstrap(documentId) ? RoomMode.Join : RoomMode.Create),
    onlineUserIds: (documentId) =>
      new Set(
        roomsOf(documentId).flatMap((room) =>
          [...room.connections.values()].map(({ connection }) => (connection.context as CollaborationContext).userId),
        ),
      ),
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
