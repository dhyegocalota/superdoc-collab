import * as Y from 'yjs';
import { findBootstrapSequence, isBootstrapCommitted, type LoggedUpdate, type ReadModel, type UpdateLog } from '@superdoc-collab/history';
import type { ClientActor } from '@superdoc-collab/types';

export const ROOM_MODE_SCAN_BATCH_SIZE = 100;

type ScanProgress = { afterSequence: number; document: Y.Doc };

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
  const scans = new Map<string, ScanProgress>();
  function progressOf(documentId: string): ScanProgress {
    const existing = scans.get(documentId);
    if (existing !== undefined) return existing;
    const created = { afterSequence: 0, document: new Y.Doc() };
    scans.set(documentId, created);
    return created;
  }
  function scanForward(documentId: string): boolean {
    const progress = progressOf(documentId);
    const page = updateLog.readBatch({ documentName: documentId, afterSequence: progress.afterSequence, limit: ROOM_MODE_SCAN_BATCH_SIZE });
    const last = page.at(-1);
    if (!last) return false;
    const found = findBootstrapSequence({ updates: page, document: progress.document });
    progress.afterSequence = last.sequence;
    if (found !== null) return true;
    return scanForward(documentId);
  }
  function hasCommittedBootstrap(documentId: string): boolean {
    if (readModel.cursor(documentId) !== null) return true;
    const snapshot = updateLog.latestSnapshot({ documentName: documentId, atOrBefore: Number.MAX_SAFE_INTEGER });
    if (!snapshot) return scanForward(documentId);
    const fromSnapshot = new Y.Doc();
    Y.applyUpdate(fromSnapshot, snapshot.state);
    return isBootstrapCommitted({ document: fromSnapshot });
  }
  return {
    isCommitted: (documentId) => {
      if (committed.has(documentId)) return true;
      if (!hasCommittedBootstrap(documentId)) return false;
      committed.add(documentId);
      scans.delete(documentId);
      return true;
    },
    commit: ({ documentId, document, ...logged }) => {
      const appended = updateLog.appendCommitted({ documentName: documentId, state: Y.encodeStateAsUpdate(document), ...logged });
      committed.add(documentId);
      scans.delete(documentId);
      return appended;
    },
    forget: (documentId) => {
      committed.delete(documentId);
      scans.delete(documentId);
    },
  };
}
