import type * as Y from 'yjs';
import type { ReadModel, UpdateLog } from '@superdoc-collab/history';

export type BootstrapState = {
  isCommitted: (documentId: string) => boolean;
  markCommitted: (parameters: { documentId: string; sequence: number; document: Y.Doc }) => void;
  forget: (documentId: string) => void;
};

export function createBootstrapState({ updateLog, readModel }: { updateLog: UpdateLog; readModel: ReadModel }): BootstrapState {
  throw new Error('createBootstrapState is not implemented');
}
