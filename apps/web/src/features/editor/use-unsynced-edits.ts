import { ConnectionState } from '@superdoc-collab/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TransportReport } from './use-connection-state';

type UnsyncedEditsInput = { connectionState: ConnectionState; isTitleDirty: boolean; isReader: boolean };

type UnsyncedEditsView = {
  isUnsynced: boolean;
  reportEdit: () => void;
  reportTransport: (report: TransportReport) => void;
};

const OUTAGE_STATES: ConnectionState[] = [ConnectionState.Lost, ConnectionState.Reconnecting, ConnectionState.Failed];
const BEFORE_UNLOAD_EVENT = 'beforeunload';
const BEFORE_UNLOAD_RETURN_VALUE = '';

function preventUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = BEFORE_UNLOAD_RETURN_VALUE;
}

export function useUnsyncedEdits({ connectionState, isTitleDirty, isReader }: UnsyncedEditsInput): UnsyncedEditsView {
  const [hasOfflineEdit, setHasOfflineEdit] = useState(false);
  const isOutageRef = useRef(false);
  const isUnsynced = !isReader && (hasOfflineEdit || isTitleDirty);

  useEffect(() => {
    isOutageRef.current = OUTAGE_STATES.includes(connectionState);
  }, [connectionState]);

  useEffect(() => {
    if (!isUnsynced) return;
    window.addEventListener(BEFORE_UNLOAD_EVENT, preventUnload);
    return () => window.removeEventListener(BEFORE_UNLOAD_EVENT, preventUnload);
  }, [isUnsynced]);

  const reportEdit = useCallback((): void => {
    if (!isOutageRef.current) return;
    setHasOfflineEdit(true);
  }, []);

  const reportTransport = useCallback((report: TransportReport): void => {
    if (!report.hasSynced) return;
    setHasOfflineEdit(false);
  }, []);

  return { isUnsynced, reportEdit, reportTransport };
}
