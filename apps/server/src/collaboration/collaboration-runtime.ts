import type { Document, Hocuspocus } from '@hocuspocus/server';
import { findBootstrapSequence, type ReadModel, type UpdateLog } from '@superdoc-history/history';
import { RoomMode } from '@superdoc-history/types';
import type { DocumentFileStorage } from '../documents/file-storage';
import type { ProjectionScheduler } from '../history/projection-scheduler';
import type { CollaborationContext } from './collaboration-server';
import { documentIdFromRoomName } from './room-name';

export type DocumentRuntime = {
  roomMode: (documentId: string) => RoomMode;
  onlineUserIds: (documentId: string) => Set<string>;
  importRevisions: (documentId: string) => void;
  forget: (documentId: string) => Promise<void>;
};

export function createCollaborationRuntime({ hocuspocus, log, readModel, scheduler, storage }: { hocuspocus: Hocuspocus; log: UpdateLog; readModel: ReadModel; scheduler: ProjectionScheduler; storage: DocumentFileStorage }): DocumentRuntime {
  const bootstrapped = new Set<string>();
  function roomsOf(documentId: string): Document[] {
    return [...hocuspocus.documents.values()].filter((room) => documentIdFromRoomName(room.name) === documentId);
  }
  function hasCommittedBootstrap(documentId: string): boolean {
    if (bootstrapped.has(documentId)) return true;
    const isProjected = readModel.cursor(documentId) !== null;
    const committed = isProjected || findBootstrapSequence(log.read({ documentName: documentId, untilSequence: Number.MAX_SAFE_INTEGER })) !== null;
    if (committed) bootstrapped.add(documentId);
    return committed;
  }
  return {
    roomMode: (documentId) => (hasCommittedBootstrap(documentId) ? RoomMode.Join : RoomMode.Create),
    onlineUserIds: (documentId) => new Set(roomsOf(documentId).flatMap((room) => [...room.connections.values()].map(({ connection }) => (connection.context as CollaborationContext).userId))),
    importRevisions: (documentId) => scheduler.importRevisions({ documentId, filePath: storage.pathOf(documentId) }),
    forget: async (documentId) => {
      roomsOf(documentId).forEach((room) => hocuspocus.closeConnections(room.name));
      log.forget(documentId);
      bootstrapped.delete(documentId);
      await scheduler.forget(documentId);
    },
  };
}
