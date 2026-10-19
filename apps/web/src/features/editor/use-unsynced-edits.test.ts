import { ConnectionFailureReason, ConnectionState } from '@superdoc-collab/types';
import { act, renderHook } from '@testing-library/react';
import { expect, test } from 'vitest';
import { TransportReading, type TransportReport } from './use-connection-state';
import { useUnsyncedEdits } from './use-unsynced-edits';

type Input = { connectionState: ConnectionState; isTitleDirty: boolean };

const ONLINE: Input = { connectionState: ConnectionState.Online, isTitleDirty: false };
const SYNCED_REPORT: TransportReport = { reading: null, failureReason: null, hasSynced: true };
const LOST_REPORT: TransportReport = { reading: TransportReading.Lost, failureReason: ConnectionFailureReason.Unknown, hasSynced: false };
const OUTAGE_STATES = [ConnectionState.Lost, ConnectionState.Reconnecting, ConnectionState.Failed];
const BEFORE_UNLOAD = 'beforeunload';

function renderUnsynced(initialProps: Input = ONLINE) {
  return renderHook((input: Input) => useUnsyncedEdits(input), { initialProps });
}

function dispatchBeforeUnload(): Event {
  const event = new Event(BEFORE_UNLOAD, { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

test.each(OUTAGE_STATES)('an edit while %s is unsynced', (connectionState) => {
  const { result } = renderUnsynced({ connectionState, isTitleDirty: false });
  expect(result.current.isUnsynced).toBe(false);
  act(() => result.current.reportEdit());
  expect(result.current.isUnsynced).toBe(true);
});

test.each([ConnectionState.Online, ConnectionState.Recovered])('an edit while %s stays synced', (connectionState) => {
  const { result } = renderUnsynced({ connectionState, isTitleDirty: false });
  act(() => result.current.reportEdit());
  expect(result.current.isUnsynced).toBe(false);
});

test('a report with hasSynced clears the unsynced edits and one without keeps them', () => {
  const { result, rerender } = renderUnsynced({ connectionState: ConnectionState.Lost, isTitleDirty: false });
  act(() => result.current.reportEdit());
  rerender({ connectionState: ConnectionState.Reconnecting, isTitleDirty: false });
  act(() => result.current.reportTransport(LOST_REPORT));
  expect(result.current.isUnsynced).toBe(true);
  rerender({ connectionState: ConnectionState.Recovered, isTitleDirty: false });
  act(() => result.current.reportTransport(SYNCED_REPORT));
  expect(result.current.isUnsynced).toBe(false);
});

test('a dirty title is unsynced until the title edit ends', () => {
  const { result, rerender } = renderUnsynced();
  rerender({ ...ONLINE, isTitleDirty: true });
  expect(result.current.isUnsynced).toBe(true);
  rerender(ONLINE);
  expect(result.current.isUnsynced).toBe(false);
});

test('a dirty title survives a synced report', () => {
  const { result } = renderUnsynced({ ...ONLINE, isTitleDirty: true });
  act(() => result.current.reportTransport(SYNCED_REPORT));
  expect(result.current.isUnsynced).toBe(true);
});

test('the callbacks keep their identity across renders', () => {
  const { result, rerender } = renderUnsynced();
  const { reportEdit, reportTransport } = result.current;
  rerender({ connectionState: ConnectionState.Lost, isTitleDirty: true });
  expect(result.current.reportEdit).toBe(reportEdit);
  expect(result.current.reportTransport).toBe(reportTransport);
});

test('beforeunload is prevented only while unsynced', () => {
  const { result, rerender } = renderUnsynced({ connectionState: ConnectionState.Lost, isTitleDirty: false });
  expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
  act(() => result.current.reportEdit());
  const unsyncedEvent = dispatchBeforeUnload() as BeforeUnloadEvent;
  expect(unsyncedEvent.defaultPrevented).toBe(true);
  expect(unsyncedEvent.returnValue).toBe('');
  rerender({ connectionState: ConnectionState.Recovered, isTitleDirty: false });
  act(() => result.current.reportTransport(SYNCED_REPORT));
  expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
});

test('beforeunload is released on unmount', () => {
  const { unmount } = renderUnsynced({ ...ONLINE, isTitleDirty: true });
  expect(dispatchBeforeUnload().defaultPrevented).toBe(true);
  unmount();
  expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
});
