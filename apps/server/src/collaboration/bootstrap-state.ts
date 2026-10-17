import * as Y from 'yjs';
import { findBootstrapSequence, type ReadModel, type UpdateLog } from '@superdoc-collab/history';

export const ROOM_MODE_SCAN_BATCH_SIZE = 100;

export type BootstrapState = {
  isCommitted: (documentId: string) => boolean;
  markCommitted: (parameters: { documentId: string; sequence: number; document: Y.Doc }) => void;
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
    const isProjected = readModel.cursor(documentId) !== null;
    return isProjected || findCommittedBootstrap({ documentId, afterSequence: 0, document: new Y.Doc() }) !== null;
  }
  return {
    isCommitted: (documentId) => {
      if (committed.has(documentId)) return true;
      if (!hasCommittedBootstrap(documentId)) return false;
      committed.add(documentId);
      return true;
    },
    markCommitted: ({ documentId, sequence, document }) => {
      updateLog.writeSnapshot({ documentName: documentId, sequence, state: Y.encodeStateAsUpdate(document) });
      committed.add(documentId);
    },
    forget: (documentId) => {
      committed.delete(documentId);
    },
  };
}
