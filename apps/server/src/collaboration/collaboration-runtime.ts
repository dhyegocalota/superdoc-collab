import type { Connection, Document, Hocuspocus } from '@hocuspocus/server';
import type { UpdateLog } from '@superdoc-collab/history';
import {
  ACCESS_REVOKED_CLOSE_CODE,
  ACCESS_REVOKED_REASON,
  BootstrapStage,
  ClientActor,
  RoomMode,
  type BootstrapProgress,
} from '@superdoc-collab/types';
import type { DocumentFileStorage } from '../documents/file-storage';
import type { TimelinePipelineCache } from '../history/timeline-pipeline-cache';
import type { InsightsServices } from '../http/app';
import type { VersionsService } from '../history/versions-service';
import type { VersionRooms } from './version-rooms';
import type { ProjectionScheduler } from '../history/projection-scheduler';
import type { CollaborationContext } from './collaboration-context';
import type { BootstrapState } from './bootstrap-state';
import { COMMITTED_WITHOUT_BOOTSTRAP, type RoomBootstrap } from './room-bootstrap';
import type { RoomModeAnswer, RoomModes } from './room-modes';
import { documentIdFromRoomName } from './room-name';

const REVOKED_CLOSE_LOG = 'Closed the sockets of a revoked member of';

export { ROOM_MODE_SCAN_BATCH_SIZE } from './bootstrap-state';

export type DocumentRuntime = {
  roomMode: (documentId: string) => RoomMode;
  roomModeFor: (parameters: { documentId: string; userId: string }) => RoomModeAnswer;
  bootstrapRoom: (documentId: string) => BootstrapProgress;
  bootstrapRoomOnDevice: (documentId: string) => BootstrapProgress;
  bootstrapBlankRoom: (documentId: string) => BootstrapProgress;
  isPreparedOnDevice: (documentId: string) => boolean;
  reopenDeviceJob: (parameters: { documentId: string; userId: string }) => boolean;
  isDeviceCreator: (parameters: { documentId: string; userId: string; tabId: string | null }) => boolean;
  bootstrapQueueWaitMs: (parameters: { ownerUserId: string; documentXmlBytes: number }) => number | null;
  isBootstrapRunningFor: (parameters: { ownerUserId: string; documentXmlBytes: number }) => boolean;
  bootstrapWaitMs: (parameters: { ownerUserId: string; documentXmlBytes: number }) => number;
  closeUserConnections: (parameters: { documentId: string; userId: string }) => void;
  closeConnectionsOfUser: (userId: string) => void;
  onlineUserIds: (documentId: string) => Set<string>;
  onlineTabIds: ({ documentId, userId }: { documentId: string; userId: string }) => Set<string>;
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
  roomBootstrap,
  bootstrap,
  roomModes,
}: {
  hocuspocus: Hocuspocus;
  updateLog: UpdateLog;
  scheduler: ProjectionScheduler;
  storage: DocumentFileStorage;
  timelinePipelines: TimelinePipelineCache;
  versions: VersionsService;
  versionRooms: VersionRooms;
  insights: InsightsServices;
  roomBootstrap: RoomBootstrap;
  bootstrap: BootstrapState;
  roomModes: RoomModes;
}): DocumentRuntime {
  function roomsOf(documentId: string): Document[] {
    return [...hocuspocus.documents.values()].filter((room) => documentIdFromRoomName(room.name) === documentId);
  }
  function connectionsOf(documentId: string): Connection[] {
    return roomsOf(documentId).flatMap((room) => [...room.connections.values()].map(({ connection }) => connection));
  }
  function bootstrapWith({
    documentId,
    request,
  }: {
    documentId: string;
    request: (documentId: string) => BootstrapProgress;
  }): BootstrapProgress {
    const progress = roomBootstrap.progressOf(documentId);
    if (progress !== null && progress.stage !== BootstrapStage.Failed) return progress;
    if (bootstrap.isKnownCommitted(documentId)) return COMMITTED_WITHOUT_BOOTSTRAP;
    return request(documentId);
  }
  return {
    bootstrapRoom: (documentId) => bootstrapWith({ documentId, request: (id) => roomBootstrap.request(id) }),
    bootstrapRoomOnDevice: (documentId) => bootstrapWith({ documentId, request: (id) => roomBootstrap.requestOnDevice(id) }),
    bootstrapBlankRoom: (documentId) => bootstrapWith({ documentId, request: (id) => roomBootstrap.requestBlank(id) }),
    isPreparedOnDevice: (documentId) => roomBootstrap.isDeviceJob(documentId),
    reopenDeviceJob: (parameters) => {
      if (!roomBootstrap.canReopenDevice(parameters)) return false;
      const isRoomHeld = roomsOf(parameters.documentId).length > 0;
      if (isRoomHeld) return true;
      roomBootstrap.reopenDevice(parameters);
      return false;
    },
    isDeviceCreator: (parameters) => roomBootstrap.isDeviceCreator(parameters),
    bootstrapQueueWaitMs: ({ ownerUserId, documentXmlBytes }) => roomBootstrap.queueWaitMs({ ownerId: ownerUserId, documentXmlBytes }),
    isBootstrapRunningFor: ({ ownerUserId, documentXmlBytes }) => roomBootstrap.isRunningFor({ ownerId: ownerUserId, documentXmlBytes }),
    bootstrapWaitMs: ({ ownerUserId, documentXmlBytes }) => roomBootstrap.predictedWaitMs({ ownerId: ownerUserId, documentXmlBytes }),
    closeUserConnections: ({ documentId, userId }) => {
      const revokedConnections = connectionsOf(documentId).filter(
        (connection) => (connection.context as CollaborationContext).userId === userId,
      );
      revokedConnections.forEach((connection) => connection.close({ code: ACCESS_REVOKED_CLOSE_CODE, reason: ACCESS_REVOKED_REASON }));
      versionRooms.closeUser({ documentId, userId });
      console.warn(`${REVOKED_CLOSE_LOG} ${documentId}`);
    },
    closeConnectionsOfUser: (userId) => {
      [...hocuspocus.documents.values()]
        .flatMap((room) => [...room.connections.values()].map(({ connection }) => connection))
        .filter((connection) => (connection.context as CollaborationContext).userId === userId)
        .forEach((connection) => connection.close({ code: ACCESS_REVOKED_CLOSE_CODE, reason: ACCESS_REVOKED_REASON }));
      versionRooms.closeAllOfUser(userId);
    },
    roomModeFor: (parameters) => {
      if (roomBootstrap.isInFlight(parameters.documentId)) return { isSpent: false, roomMode: RoomMode.Join };
      return roomModes.resolve(parameters);
    },
    roomMode: (documentId) => (bootstrap.isCommitted(documentId) ? RoomMode.Join : RoomMode.Create),
    onlineUserIds: (documentId) =>
      new Set(
        connectionsOf(documentId)
          .map((connection) => connection.context as CollaborationContext)
          .filter((connectionContext) => connectionContext.actor === ClientActor.Human)
          .map((connectionContext) => connectionContext.userId),
      ),
    onlineTabIds: ({ documentId, userId }) =>
      new Set(
        roomsOf(documentId)
          .flatMap((room) => [...room.connections.values()].map(({ connection }) => connection.context as CollaborationContext))
          .filter((connectionContext) => connectionContext.userId === userId)
          .flatMap((connectionContext) => (connectionContext.tabId === null ? [] : [connectionContext.tabId])),
      ),
    importRevisions: (documentId) => scheduler.importRevisions({ documentId, filePath: storage.pathOf(documentId) }),
    forget: async (documentId) => {
      roomsOf(documentId).forEach((room) => hocuspocus.closeConnections(room.name));
      updateLog.forget(documentId);
      bootstrap.forget(documentId);
      roomBootstrap.forget(documentId);
      timelinePipelines.forget(documentId);
      versions.forget(documentId);
      await versionRooms.forget(documentId);
      await scheduler.forget(documentId);
      insights.selection.forget(documentId);
    },
  };
}
