import { afterEach, expect, test, vi } from 'vitest';
import {
  allowLeave,
  cancelLeave,
  clearUnsyncedEdits,
  getUnsyncedEditsSnapshot,
  requestLeave,
  setUnsynced,
  subscribeUnsyncedEdits,
} from './unsynced-edits-store';

afterEach(() => clearUnsyncedEdits());

test('starts synced with no pending leave', () => {
  expect(getUnsyncedEditsSnapshot()).toEqual({ isUnsynced: false, pendingLeave: null, isLeaveAllowed: false });
});

test('setUnsynced and requestLeave change the snapshot', () => {
  const leave = vi.fn();
  setUnsynced(true);
  requestLeave(leave);
  expect(getUnsyncedEditsSnapshot()).toEqual({ isUnsynced: true, pendingLeave: leave, isLeaveAllowed: false });
});

test('cancelLeave drops the pending leave and keeps the unsynced flag', () => {
  setUnsynced(true);
  requestLeave(vi.fn());
  cancelLeave();
  expect(getUnsyncedEditsSnapshot()).toEqual({ isUnsynced: true, pendingLeave: null, isLeaveAllowed: false });
});

test('clearUnsyncedEdits resets everything', () => {
  setUnsynced(true);
  requestLeave(vi.fn());
  clearUnsyncedEdits();
  expect(getUnsyncedEditsSnapshot()).toEqual({ isUnsynced: false, pendingLeave: null, isLeaveAllowed: false });
});

test('subscribers hear each change once and stop after unsubscribing', () => {
  const listener = vi.fn();
  const unsubscribe = subscribeUnsyncedEdits(listener);
  setUnsynced(true);
  setUnsynced(true);
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  setUnsynced(false);
  expect(listener).toHaveBeenCalledTimes(1);
});

test('allowLeave is remembered until the store is cleared', () => {
  allowLeave();
  expect(getUnsyncedEditsSnapshot().isLeaveAllowed).toBe(true);
  clearUnsyncedEdits();
  expect(getUnsyncedEditsSnapshot().isLeaveAllowed).toBe(false);
});
