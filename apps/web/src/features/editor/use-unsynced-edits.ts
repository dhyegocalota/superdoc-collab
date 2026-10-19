import type { ConnectionState } from '@superdoc-collab/types';
import type { TransportReport } from './use-connection-state';

type UnsyncedEditsInput = { connectionState: ConnectionState; isTitleDirty: boolean };

type UnsyncedEditsView = {
  isUnsynced: boolean;
  reportEdit: () => void;
  reportTransport: (report: TransportReport) => void;
};

export function useUnsyncedEdits(input: UnsyncedEditsInput): UnsyncedEditsView {
  throw new Error(`useUnsyncedEdits is not implemented for ${input.connectionState}`);
}
