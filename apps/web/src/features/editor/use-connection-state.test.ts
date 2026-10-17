import { ConnectionFailureReason, ConnectionState, RECOVERED_NOTICE_MS } from '@superdoc-collab/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, useLayoutEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { membersQueryKey } from './editor-api';
import {
  mergeConnectionState,
  TransportReading,
  transportReportOf,
  useConnectionState,
  type TransportReport,
} from './use-connection-state';

type MembersInput = { isCurrentUserOnline: boolean | null; membersAnsweredAt: number | null };

const NOT_ANSWERED: MembersInput = { isCurrentUserOnline: null, membersAnsweredAt: null };
const START_TIME = new Date('2026-10-17T10:00:00Z');
const OUTAGE_DELAY_MS = 1000;
const ANSWER_DELAY_MS = 50;

function readingReport(reading: TransportReading | null, failureReason: ConnectionFailureReason | null = null): TransportReport {
  return { reading, failureReason, hasSynced: false };
}

type ConnectionView = ReturnType<typeof useConnectionState>;

function renderConnection({
  initialProps = NOT_ANSWERED,
  onCommit = () => undefined,
}: { initialProps?: MembersInput; onCommit?: (view: ConnectionView) => void } = {}) {
  const queryClient = new QueryClient();
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
  const cancelQueries = vi.spyOn(queryClient, 'cancelQueries');
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  const rendered = renderHook(
    (members: MembersInput) => {
      const view = useConnectionState({ documentId: DOCUMENT_ID, ...members });
      useLayoutEffect(() => onCommit(view));
      return view;
    },
    { wrapper, initialProps },
  );
  function report(next: TransportReport): void {
    act(() => rendered.result.current.reportTransport(next));
  }
  function advance(milliseconds: number): void {
    act(() => {
      vi.advanceTimersByTime(milliseconds);
    });
  }
  function answer(isCurrentUserOnline: boolean | null): void {
    advance(ANSWER_DELAY_MS);
    rendered.rerender({ isCurrentUserOnline, membersAnsweredAt: Date.now() });
  }
  return { ...rendered, report, advance, answer, invalidateQueries, cancelQueries };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START_TIME);
});

afterEach(() => {
  vi.useRealTimers();
});

test.each([
  { reading: TransportReading.Failed, isCurrentUserOnline: true, expected: ConnectionState.Failed },
  { reading: TransportReading.Failed, isCurrentUserOnline: false, expected: ConnectionState.Failed },
  { reading: TransportReading.Failed, isCurrentUserOnline: null, expected: ConnectionState.Failed },
  { reading: TransportReading.Lost, isCurrentUserOnline: false, expected: ConnectionState.Lost },
  { reading: TransportReading.Lost, isCurrentUserOnline: null, expected: ConnectionState.Lost },
  { reading: TransportReading.Lost, isCurrentUserOnline: true, expected: ConnectionState.Recovered },
  { reading: TransportReading.Reconnecting, isCurrentUserOnline: false, expected: ConnectionState.Reconnecting },
  { reading: TransportReading.Reconnecting, isCurrentUserOnline: null, expected: ConnectionState.Reconnecting },
  { reading: TransportReading.Reconnecting, isCurrentUserOnline: true, expected: ConnectionState.Recovered },
  { reading: TransportReading.Clear, isCurrentUserOnline: true, expected: ConnectionState.Online },
  { reading: TransportReading.Clear, isCurrentUserOnline: false, expected: ConnectionState.Online },
  { reading: TransportReading.Clear, isCurrentUserOnline: null, expected: ConnectionState.Online },
])('merge: $reading with the server flag $isCurrentUserOnline is $expected', ({ reading, isCurrentUserOnline, expected }) => {
  expect(mergeConnectionState({ reading, isCurrentUserOnline })).toBe(expected);
});

test.each([
  { state: 'degraded', kind: 'lost', expected: readingReport(TransportReading.Lost) },
  { state: 'degraded', kind: 'reconnecting', expected: readingReport(TransportReading.Reconnecting) },
  { state: 'failed', kind: 'failed', expected: readingReport(TransportReading.Failed, ConnectionFailureReason.Unknown) },
  { state: 'failed', kind: 'lost', expected: readingReport(TransportReading.Failed, ConnectionFailureReason.Unknown) },
  { state: 'connecting', kind: 'initial', expected: readingReport(TransportReading.Clear) },
  { state: 'synced', kind: 'initial', expected: { ...readingReport(TransportReading.Clear), hasSynced: true } },
  { state: 'synced', kind: 'recovered', expected: { ...readingReport(null), hasSynced: true } },
  { state: 'degraded', kind: 'recovered', expected: { ...readingReport(null), hasSynced: true } },
] as const)('transport report: state $state and kind $kind', ({ state, kind, expected }) => {
  expect(transportReportOf({ state, kind })).toEqual(expected);
});

test('Lost, Reconnecting, Recovered, then Online after the notice', () => {
  const connection = renderConnection();
  expect(connection.result.current.state).toBe(ConnectionState.Online);
  connection.report(readingReport(TransportReading.Lost));
  expect(connection.result.current.state).toBe(ConnectionState.Lost);
  connection.report(readingReport(TransportReading.Reconnecting));
  expect(connection.result.current.state).toBe(ConnectionState.Reconnecting);
  connection.answer(true);
  expect(connection.result.current.state).toBe(ConnectionState.Recovered);
  connection.advance(RECOVERED_NOTICE_MS - 1);
  expect(connection.result.current.state).toBe(ConnectionState.Recovered);
  connection.advance(1);
  expect(connection.result.current.state).toBe(ConnectionState.Online);
});

test('a Lost reading cancels the in-flight members request and refetches', () => {
  const connection = renderConnection();
  connection.report(readingReport(TransportReading.Lost));
  expect(connection.cancelQueries).toHaveBeenCalledWith({ queryKey: membersQueryKey(DOCUMENT_ID) });
  expect(connection.invalidateQueries).toHaveBeenCalledWith({ queryKey: membersQueryKey(DOCUMENT_ID) });
});

test('a server flag that was true before the Lost reading stays Lost', () => {
  const connection = renderConnection({ initialProps: { isCurrentUserOnline: true, membersAnsweredAt: Date.now() } });
  connection.advance(OUTAGE_DELAY_MS);
  connection.report(readingReport(TransportReading.Lost));
  expect(connection.result.current.state).toBe(ConnectionState.Lost);
  connection.answer(true);
  expect(connection.result.current.state).toBe(ConnectionState.Recovered);
});

test('an answer that finished before the Lost reading never confirms recovery', () => {
  const connection = renderConnection();
  const answeredBeforeLoss = Date.now();
  connection.advance(OUTAGE_DELAY_MS);
  connection.report(readingReport(TransportReading.Lost));
  connection.rerender({ isCurrentUserOnline: true, membersAnsweredAt: answeredBeforeLoss });
  expect(connection.result.current.state).toBe(ConnectionState.Lost);
});

test('a recovered report while Reconnecting with an unknown server flag stays Reconnecting', () => {
  const connection = renderConnection();
  connection.report(readingReport(TransportReading.Reconnecting));
  connection.report(transportReportOf({ state: 'synced', kind: 'recovered' }));
  expect(connection.result.current.state).toBe(ConnectionState.Reconnecting);
});

test('Failed is sticky until reset', () => {
  const connection = renderConnection();
  connection.report(readingReport(TransportReading.Failed, ConnectionFailureReason.AccessDenied));
  connection.report(readingReport(TransportReading.Clear));
  connection.answer(true);
  expect(connection.result.current.state).toBe(ConnectionState.Failed);
  expect(connection.result.current.failureReason).toBe(ConnectionFailureReason.AccessDenied);
});

test.each([
  { name: 'the callback first', reports: [ConnectionFailureReason.Unknown, ConnectionFailureReason.AccessDenied] },
  { name: 'the exception first', reports: [ConnectionFailureReason.AccessDenied, ConnectionFailureReason.Unknown] },
])('an exception reason beats Unknown from the callback, $name', ({ reports }) => {
  const connection = renderConnection();
  reports.forEach((failureReason) => connection.report(readingReport(TransportReading.Failed, failureReason)));
  expect(connection.result.current.failureReason).toBe(ConnectionFailureReason.AccessDenied);
});

test('two readings in one tick fold in arrival order', () => {
  const connection = renderConnection();
  act(() => {
    connection.result.current.reportTransport(readingReport(TransportReading.Lost));
    connection.result.current.reportTransport(readingReport(TransportReading.Reconnecting));
  });
  expect(connection.result.current.state).toBe(ConnectionState.Reconnecting);
  act(() => {
    connection.result.current.reportTransport(readingReport(TransportReading.Reconnecting));
    connection.result.current.reportTransport(readingReport(TransportReading.Lost));
  });
  expect(connection.result.current.state).toBe(ConnectionState.Lost);
});

test('reset returns to Online with no failure reason', () => {
  const connection = renderConnection();
  connection.report(readingReport(TransportReading.Failed, ConnectionFailureReason.SyncTimeout));
  act(() => connection.result.current.resetConnection());
  expect(connection.result.current.state).toBe(ConnectionState.Online);
  expect(connection.result.current.failureReason).toBeNull();
});

test('a Lost reading during the Recovered notice cancels the notice', () => {
  const connection = renderConnection();
  connection.report(readingReport(TransportReading.Lost));
  connection.answer(true);
  expect(connection.result.current.state).toBe(ConnectionState.Recovered);
  connection.report(readingReport(TransportReading.Lost));
  connection.answer(false);
  expect(connection.result.current.state).toBe(ConnectionState.Lost);
  connection.advance(RECOVERED_NOTICE_MS + RECOVERED_NOTICE_MS / 6);
  expect(connection.result.current.state).toBe(ConnectionState.Lost);
  expect(vi.getTimerCount()).toBe(0);
});

test('a synced report refetches members and changes nothing else', () => {
  const connection = renderConnection();
  connection.report({ reading: null, failureReason: null, hasSynced: true });
  expect(connection.invalidateQueries).toHaveBeenCalledWith({ queryKey: membersQueryKey(DOCUMENT_ID) });
  expect(connection.result.current.state).toBe(ConnectionState.Online);
});

test('a recovered report refetches members', () => {
  const connection = renderConnection();
  connection.report(readingReport(TransportReading.Lost));
  connection.invalidateQueries.mockClear();
  connection.report(transportReportOf({ state: 'synced', kind: 'recovered' }));
  expect(connection.invalidateQueries).toHaveBeenCalledWith({ queryKey: membersQueryKey(DOCUMENT_ID) });
});

test('the notice timer is cleared on unmount', () => {
  const connection = renderConnection();
  connection.report(readingReport(TransportReading.Lost));
  connection.answer(true);
  expect(vi.getTimerCount()).toBe(1);
  connection.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test('a late Lost reading after Failed keeps the failure reason', () => {
  const connection = renderConnection();
  connection.report(readingReport(TransportReading.Failed, ConnectionFailureReason.Unknown));
  connection.report(readingReport(TransportReading.Lost));
  expect(connection.result.current.state).toBe(ConnectionState.Failed);
  expect(connection.result.current.failureReason).toBe(ConnectionFailureReason.Unknown);
});

test('a Failed report queued between the recovery render and its effect stays Failed', () => {
  let hasQueuedFailure = false;
  const connection = renderConnection({
    onCommit: (view) => {
      if (view.state !== ConnectionState.Recovered || hasQueuedFailure) return;
      hasQueuedFailure = true;
      view.reportTransport(readingReport(TransportReading.Failed, ConnectionFailureReason.AccessDenied));
    },
  });
  connection.report(readingReport(TransportReading.Lost));
  connection.answer(true);
  expect(connection.result.current.state).toBe(ConnectionState.Failed);
  expect(connection.result.current.failureReason).toBe(ConnectionFailureReason.AccessDenied);
});

test.each([TransportReading.Lost, TransportReading.Reconnecting])(
  'a %s report cancels the members request before it returns',
  (reading) => {
    const connection = renderConnection();
    act(() => {
      connection.result.current.reportTransport(readingReport(reading));
      expect(connection.cancelQueries).toHaveBeenCalledWith({ queryKey: membersQueryKey(DOCUMENT_ID) });
    });
  },
);
