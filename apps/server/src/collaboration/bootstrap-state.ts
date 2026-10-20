import * as Y from 'yjs';
import { findBootstrapSequence, isBootstrapCommitted, type LoggedUpdate, type ReadModel, type UpdateLog } from '@superdoc-collab/history';
import { BOOTSTRAP_SCAN_CACHE_ENTRIES, type ClientActor } from '@superdoc-collab/types';
import { LruMap } from '../limits/lru-map';

export const ROOM_MODE_SCAN_BATCH_SIZE = 100;

type ScanProgress = { afterSequence: number; document: Y.Doc };

export type BootstrapState = {
  isKnownCommitted: (documentId: string) => boolean;
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

export function createBootstrapState({
  updateLog,
  readModel,
  onCommitted = () => undefined,
}: {
  updateLog: UpdateLog;
  readModel: ReadModel;
  onCommitted?: (committed: { documentId: string; stateBytes: number; state: Uint8Array }) => void;
}): BootstrapState {
  const committed = new Set<string>();
  const scans = new LruMap<ScanProgress>({ isOverBudget: (entries) => entries.size > BOOTSTRAP_SCAN_CACHE_ENTRIES });
  function progressOf(documentId: string): ScanProgress {
    const existing = scans.get(documentId);
    if (existing !== null) return existing;
    const created = { afterSequence: 0, document: new Y.Doc() };
    scans.set({ key: documentId, value: created });
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
    scans.delete(documentId);
    const fromSnapshot = new Y.Doc();
    Y.applyUpdate(fromSnapshot, snapshot.state);
    return isBootstrapCommitted({ document: fromSnapshot });
  }
  return {
    isKnownCommitted: (documentId) => committed.has(documentId) || readModel.cursor(documentId) !== null,
    isCommitted: (documentId) => {
      if (committed.has(documentId)) return true;
      if (!hasCommittedBootstrap(documentId)) return false;
      committed.add(documentId);
      scans.delete(documentId);
      return true;
    },
    commit: ({ documentId, document, ...logged }) => {
      const state = Y.encodeStateAsUpdate(document);
      const appended = updateLog.appendCommitted({ documentName: documentId, state, ...logged });
      committed.add(documentId);
      scans.delete(documentId);
      onCommitted({ documentId, stateBytes: state.byteLength, state });
      return appended;
    },
    forget: (documentId) => {
      committed.delete(documentId);
      scans.delete(documentId);
    },
  };
}
