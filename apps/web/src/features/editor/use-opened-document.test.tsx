import {
  BootstrapStage,
  DOCUMENT_READY_POLL_MS,
  DOCUMENT_UNAVAILABLE_MESSAGE,
  DocumentRole,
  HttpStatus,
  MINUTE_MS,
  PREPARING_POLL_MS,
  RoomMode,
} from '@superdoc-collab/types';
import { focusManager } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { bootstrapAt, DOCUMENT_ID, openedAs } from '@/testing/opened-document';
import { renderHookWithRouter } from '@/testing/render-with-providers';
import { openedDocumentQueryKey } from './editor-api';
import { DOCUMENT_LOAD_ERROR_MESSAGE } from './editor-copy';
import { DocumentReadiness, useOpenedDocument, useOpenedDocumentWithoutPolling } from './use-opened-document';

const HIDDEN_MS = 10 * MINUTE_MS;
const FAKE_TIMERS: Parameters<typeof vi.useFakeTimers>[0] = {
  toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
};
const SETTLE_MS = 100;
const ANSWER_ARRIVED_AT = new Date('2026-10-19T12:00:00Z');
const OPENED = openedAs(DocumentRole.Reader);

type Answer = () => Response;

const serverError: Answer = () => jsonResponse({ body: {}, status: HttpStatus.InternalServerError });
const notFound: Answer = () => jsonResponse({ body: {}, status: HttpStatus.NotFound });
const entered: Answer = () => jsonResponse({ body: OPENED });

function answerInOrder(...answers: Answer[]) {
  let served = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    const answer = answers[Math.min(served, answers.length - 1)]!;
    served += 1;
    return answer();
  });
}

async function advance(milliseconds: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
    await new Promise((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
  });
}

function renderOpenedDocument() {
  return renderHookWithRouter(() => useOpenedDocument(DOCUMENT_ID)).result;
}

beforeEach(() => vi.useFakeTimers(FAKE_TIMERS));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
});

test('a Queued answer is a state that polls every 2 s and enters once Ready', async () => {
  const fetchSpy = answerInOrder(answeredAt(BootstrapStage.Queued), answeredAt(BootstrapStage.Queued), entered);
  const result = renderOpenedDocument();
  await advance(0);
  expect(result.current.readiness).toBe(DocumentReadiness.Waiting);
  expect(result.current.error).toBeNull();
  expect(result.current.data).toBeUndefined();
  await advance(DOCUMENT_READY_POLL_MS);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  await advance(DOCUMENT_READY_POLL_MS);
  expect(result.current.readiness).toBe(DocumentReadiness.Ready);
  expect(result.current.data).toEqual(OPENED);
  expect(result.current.isFetchedAfterMount).toBe(true);
  await advance(DOCUMENT_READY_POLL_MS * 5);
  expect(fetchSpy).toHaveBeenCalledTimes(3);
});

test('ten minutes hidden with zero polls keeps it waiting', async () => {
  focusManager.setFocused(false);
  const fetchSpy = answerInOrder(answeredAt(BootstrapStage.Queued));
  const result = renderOpenedDocument();
  await advance(HIDDEN_MS);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(result.current.readiness).toBe(DocumentReadiness.Waiting);
});

test('a server error stays an error and retry refetches once', async () => {
  const fetchSpy = answerInOrder(serverError, entered);
  const result = renderOpenedDocument();
  await advance(0);
  expect(result.current.readiness).toBe(DocumentReadiness.Failed);
  expect(result.current.error?.message).toBe(DOCUMENT_LOAD_ERROR_MESSAGE);
  await advance(DOCUMENT_READY_POLL_MS * 5);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  act(() => result.current.retry());
  await advance(0);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  expect(result.current.readiness).toBe(DocumentReadiness.Ready);
});

test('a 404 is unavailable, not a failure to retry', async () => {
  answerInOrder(notFound);
  const result = renderOpenedDocument();
  await advance(0);
  expect(result.current.readiness).toBe(DocumentReadiness.Unavailable);
  expect(result.current.error?.message).toBe(DOCUMENT_UNAVAILABLE_MESSAGE);
});

test('without polling a Queued answer is asked once and stays waiting', async () => {
  const fetchSpy = answerInOrder(answeredAt(BootstrapStage.Queued), entered);
  const result = renderHookWithRouter(() => useOpenedDocumentWithoutPolling(DOCUMENT_ID)).result;
  await advance(DOCUMENT_READY_POLL_MS * 5);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(result.current.readiness).toBe(DocumentReadiness.Waiting);
});

test('the open answer never goes stale, so a focus refetch cannot re-reserve the creator', async () => {
  answerInOrder(entered);
  const { result, queryClient } = renderHookWithRouter(() => useOpenedDocument(DOCUMENT_ID));
  await advance(0);
  expect(result.current.readiness).toBe(DocumentReadiness.Ready);
  expect(
    queryClient
      .getQueryCache()
      .find({ queryKey: openedDocumentQueryKey(DOCUMENT_ID) })
      ?.isStale(),
  ).toBe(false);
});

function answeredAt(stage: BootstrapStage): Answer {
  return () => jsonResponse({ body: { ...OPENED, bootstrap: bootstrapAt(stage) } });
}

test('a Preparing bootstrap waits, hides the answer, shows its progress and polls every second', async () => {
  const fetchSpy = answerInOrder(answeredAt(BootstrapStage.Preparing), answeredAt(BootstrapStage.Ready));
  const result = renderOpenedDocument();
  await advance(0);
  expect(result.current.readiness).toBe(DocumentReadiness.Waiting);
  expect(result.current.data).toBeUndefined();
  expect(result.current.bootstrap).toEqual(bootstrapAt(BootstrapStage.Preparing));
  await advance(PREPARING_POLL_MS);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  expect(result.current.readiness).toBe(DocumentReadiness.Ready);
  expect(result.current.data).toEqual(OPENED);
  expect(result.current.bootstrap).toEqual(OPENED.bootstrap);
});

test('a Queued bootstrap polls every 2 s', async () => {
  const fetchSpy = answerInOrder(answeredAt(BootstrapStage.Queued));
  renderOpenedDocument();
  await advance(0);
  await advance(PREPARING_POLL_MS);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  await advance(DOCUMENT_READY_POLL_MS - PREPARING_POLL_MS);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test('a Failed bootstrap is a failure that stops the poll', async () => {
  const fetchSpy = answerInOrder(answeredAt(BootstrapStage.Failed));
  const result = renderOpenedDocument();
  await advance(0);
  expect(result.current.readiness).toBe(DocumentReadiness.Failed);
  expect(result.current.data).toBeUndefined();
  await advance(DOCUMENT_READY_POLL_MS * 5);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test('the answer carries when it arrived, by the browser clock, so Preparing never compares two clocks', async () => {
  vi.setSystemTime(ANSWER_ARRIVED_AT);
  answerInOrder(answeredAt(BootstrapStage.Preparing));
  const result = renderOpenedDocument();
  await advance(0);
  expect(result.current.bootstrapAnsweredAt).toBeGreaterThanOrEqual(ANSWER_ARRIVED_AT.getTime());
  expect(result.current.bootstrapAnsweredAt).toBeLessThan(ANSWER_ARRIVED_AT.getTime() + SETTLE_MS * 2);
});

test('an answer with preparingElapsedMs keeps it', async () => {
  const bootstrap = { ...bootstrapAt(BootstrapStage.Preparing), preparingElapsedMs: 12_000 };
  answerInOrder(() => jsonResponse({ body: { ...OPENED, bootstrap } }));
  const result = renderOpenedDocument();
  await advance(0);
  expect(result.current.bootstrap!.preparingElapsedMs).toBe(12_000);
});

test('a Create answer is ready at once, whatever the bootstrap says, because the person is the source', async () => {
  answerInOrder(() => jsonResponse({ body: { ...OPENED, roomMode: RoomMode.Create, bootstrap: bootstrapAt(BootstrapStage.Preparing) } }));
  const result = renderOpenedDocument();
  await advance(0);
  expect(result.current.readiness).toBe(DocumentReadiness.Ready);
  expect(result.current.data?.roomMode).toBe(RoomMode.Create);
});

test('a Create answer for a failed device job is still ready, so a reopen converts again', async () => {
  answerInOrder(() => jsonResponse({ body: { ...OPENED, roomMode: RoomMode.Create, bootstrap: bootstrapAt(BootstrapStage.Failed) } }));
  const result = renderOpenedDocument();
  await advance(0);
  expect(result.current.readiness).toBe(DocumentReadiness.Ready);
});

test('the name of the device owner is exposed while the document waits', async () => {
  answerInOrder(() => jsonResponse({ body: { ...OPENED, preparedOnDeviceOf: 'Ana', bootstrap: bootstrapAt(BootstrapStage.Preparing) } }));
  const result = renderOpenedDocument();
  await advance(0);
  expect(result.current.preparedOnDeviceOf).toBe('Ana');
});

test('no device owner is exposed when the server prepares the document', async () => {
  answerInOrder(answeredAt(BootstrapStage.Preparing));
  const result = renderOpenedDocument();
  await advance(0);
  expect(result.current.preparedOnDeviceOf).toBeNull();
});
