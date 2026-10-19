import { useSyncExternalStore } from 'react';

export type UnsyncedEditsSnapshot = { isUnsynced: boolean; pendingLeave: (() => void) | null };

const CLEARED_SNAPSHOT: UnsyncedEditsSnapshot = { isUnsynced: false, pendingLeave: null };

const listeners = new Set<() => void>();
let snapshot = CLEARED_SNAPSHOT;

function publish(next: UnsyncedEditsSnapshot): void {
  const isChanged = next.isUnsynced !== snapshot.isUnsynced || next.pendingLeave !== snapshot.pendingLeave;
  if (!isChanged) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function setUnsynced(isUnsynced: boolean): void {
  publish({ ...snapshot, isUnsynced });
}

export function requestLeave(leave: () => void): void {
  publish({ ...snapshot, pendingLeave: leave });
}

export function cancelLeave(): void {
  publish({ ...snapshot, pendingLeave: null });
}

export function clearUnsyncedEdits(): void {
  publish(CLEARED_SNAPSHOT);
}

export function subscribeUnsyncedEdits(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUnsyncedEditsSnapshot(): UnsyncedEditsSnapshot {
  return snapshot;
}

export function useUnsyncedEditsSnapshot(): UnsyncedEditsSnapshot {
  return useSyncExternalStore(subscribeUnsyncedEdits, getUnsyncedEditsSnapshot);
}
