import { useSyncExternalStore } from 'react';

export type UnsyncedEditsSnapshot = { isUnsynced: boolean; pendingLeave: (() => void) | null };

export function setUnsynced(isUnsynced: boolean): void {
  throw new Error(`setUnsynced is not implemented for ${isUnsynced}`);
}

export function requestLeave(leave: () => void): void {
  throw new Error(`requestLeave is not implemented for ${leave.name}`);
}

export function cancelLeave(): void {
  throw new Error('cancelLeave is not implemented');
}

export function clearUnsyncedEdits(): void {
  throw new Error('clearUnsyncedEdits is not implemented');
}

export function subscribeUnsyncedEdits(listener: () => void): () => void {
  throw new Error(`subscribeUnsyncedEdits is not implemented for ${listener.name}`);
}

export function getUnsyncedEditsSnapshot(): UnsyncedEditsSnapshot {
  throw new Error('getUnsyncedEditsSnapshot is not implemented');
}

export function useUnsyncedEditsSnapshot(): UnsyncedEditsSnapshot {
  return useSyncExternalStore(subscribeUnsyncedEdits, getUnsyncedEditsSnapshot);
}
