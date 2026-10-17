import * as Y from 'yjs';
import { findBootstrapSequence, isBootstrapCommitted, type LoggedUpdate, type ReadModel, type UpdateLog } from '@superdoc-collab/history';
import type { ClientActor } from '@superdoc-collab/types';

export const ROOM_MODE_SCAN_BATCH_SIZE = 100;

export type BootstrapState = {
  isCommitted: (documentId: string) => boolean;
  commit: (parameters: {
    documentId: string;
    connectionUserId: string;
    connectionActor: ClientActor;
    update: Uint8Array;
    document: Y.Doc;
  }) => LoggedUpdate;
  forget: (documentId: string) => void;
};

export function createBootstrapState({ updateLog, readModel }: { updateLog: UpdateLog; readModel: ReadModel }): BootstrapState {
  const committed = new Set<string>();
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
    if (readModel.cursor(documentId) !== null) return true;
    const snapshot = updateLog.latestSnapshot({ documentName: documentId, atOrBefore: Number.MAX_SAFE_INTEGER });
    if (!snapshot) return findCommittedBootstrap({ documentId, afterSequence: 0, document: new Y.Doc() }) !== null;
    const fromSnapshot = new Y.Doc();
    Y.applyUpdate(fromSnapshot, snapshot.state);
    return isBootstrapCommitted({ document: fromSnapshot });
  }
  return {
    isCommitted: (documentId) => {
      if (committed.has(documentId)) return true;
      if (!hasCommittedBootstrap(documentId)) return false;
      committed.add(documentId);
      return true;
    },
    commit: ({ documentId, document, ...logged }) => {
      const appended = updateLog.appendCommitted({ documentName: documentId, state: Y.encodeStateAsUpdate(document), ...logged });
      committed.add(documentId);
      return appended;
    },
    forget: (documentId) => {
      committed.delete(documentId);
    },
  };
}
