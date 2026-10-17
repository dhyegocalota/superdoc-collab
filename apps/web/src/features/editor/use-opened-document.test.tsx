import {
  DOCUMENT_NOT_READY_ERROR,
  DOCUMENT_READY_GIVE_UP_MS,
  DOCUMENT_READY_POLL_MS,
  DOCUMENT_UNAVAILABLE_MESSAGE,
  DocumentRole,
  HttpStatus,
  MINUTE_MS,
} from '@superdoc-collab/types';
import { focusManager } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { DOCUMENT_ID, openedAs } from '@/testing/opened-document';
import { renderHookWithRouter } from '@/testing/render-with-providers';
import { DOCUMENT_LOAD_ERROR_MESSAGE } from './editor-copy';
import { DocumentReadiness, useOpenedDocument, useOpenedDocumentWithoutPolling } from './use-opened-document';

const GIVE_UP_POLLS = DOCUMENT_READY_GIVE_UP_MS / DOCUMENT_READY_POLL_MS;
const OVERSHOOT_POLLS = GIVE_UP_POLLS + 50;
const HIDDEN_MS = 10 * MINUTE_MS;
const FAKE_TIMERS: Parameters<typeof vi.useFakeTimers>[0] = {
  toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
};
const SETTLE_MS = 100;
const OPENED = openedAs(DocumentRole.Reader);

type Answer = () => Response;

const notReady: Answer = () => jsonResponse({ body: { error: DOCUMENT_NOT_READY_ERROR }, status: HttpStatus.Conflict });
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

test('a NOT_READY answer is a state that polls every 2 s and enters on 200', async () => {
  const fetchSpy = answerInOrder(notReady, notReady, entered);
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

test('after 150 polls the state is paused, and ten minutes hidden with zero polls keeps it waiting', async () => {
  const fetchSpy = answerInOrder(notReady);
  const result = renderOpenedDocument();
  await advance(DOCUMENT_READY_POLL_MS * OVERSHOOT_POLLS);
  expect(result.current.readiness).toBe(DocumentReadiness.Paused);
  expect(fetchSpy).toHaveBeenCalledTimes(GIVE_UP_POLLS);
});

test('ten minutes hidden with zero polls keeps it waiting', async () => {
  focusManager.setFocused(false);
  const fetchSpy = answerInOrder(notReady);
  const result = renderOpenedDocument();
  await advance(HIDDEN_MS);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(result.current.readiness).toBe(DocumentReadiness.Waiting);
});

test('keepWaiting restarts the count', async () => {
  const fetchSpy = answerInOrder(notReady);
  const result = renderOpenedDocument();
  await advance(DOCUMENT_READY_POLL_MS * OVERSHOOT_POLLS);
  expect(result.current.readiness).toBe(DocumentReadiness.Paused);
  act(() => result.current.keepWaiting());
  await advance(0);
  expect(result.current.readiness).toBe(DocumentReadiness.Waiting);
  await advance(DOCUMENT_READY_POLL_MS * OVERSHOOT_POLLS);
  expect(result.current.readiness).toBe(DocumentReadiness.Paused);
  expect(fetchSpy).toHaveBeenCalledTimes(GIVE_UP_POLLS * 2);
});

test('a non-409 error stays an error and retry refetches once', async () => {
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

test('without polling a NOT_READY answer is asked once and stays waiting', async () => {
  const fetchSpy = answerInOrder(notReady, entered);
  const result = renderHookWithRouter(() => useOpenedDocumentWithoutPolling(DOCUMENT_ID)).result;
  await advance(DOCUMENT_READY_POLL_MS * 5);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(result.current.readiness).toBe(DocumentReadiness.Waiting);
});
