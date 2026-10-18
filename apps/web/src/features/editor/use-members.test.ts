import { CREATOR_ATTEMPT_QUERY_KEY, CREATOR_EPOCH_QUERY_KEY, HttpStatus, TAB_QUERY_KEY, type CreatorTicket } from '@superdoc-collab/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { tabId } from '@/lib/tab-id';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { jsonResponse } from '@/testing/json-response';
import { membersQueryKey } from './editor-api';
import { useMembers } from './use-members';

const CREATOR_TICKET: CreatorTicket = { attempt: 2, epoch: 'epoch-1' };

function membersAnswer(isCurrentUserOnline: boolean, isAttemptSuperseded = false): Response {
  return jsonResponse({ body: { members: [], isCurrentUserOnline, isAttemptSuperseded } });
}

function renderMembers(creatorTicket: CreatorTicket | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  const rendered = renderHook(() => useMembers({ documentId: DOCUMENT_ID, creatorTicket }), { wrapper });
  async function poll(): Promise<void> {
    await act(() => queryClient.invalidateQueries({ queryKey: membersQueryKey(DOCUMENT_ID) }));
  }
  return { ...rendered, poll };
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('isCurrentUserOnline is null before the first answer', () => {
  vi.mocked(fetch).mockReturnValue(new Promise(() => undefined));
  const { result } = renderMembers();
  expect(result.current.isCurrentUserOnline).toBeNull();
});

test('isCurrentUserOnline follows the latest answer', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(membersAnswer(true)).mockResolvedValueOnce(membersAnswer(false));
  const { result, poll } = renderMembers();
  await waitFor(() => expect(result.current.isCurrentUserOnline).toBe(true));
  await poll();
  await waitFor(() => expect(result.current.isCurrentUserOnline).toBe(false));
});

test('isCurrentUserOnline is null after a failed poll', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(membersAnswer(true))
    .mockResolvedValueOnce(jsonResponse({ body: {}, status: HttpStatus.InternalServerError }));
  const { result, poll } = renderMembers();
  await waitFor(() => expect(result.current.isCurrentUserOnline).toBe(true));
  await poll();
  await waitFor(() => expect(result.current.isCurrentUserOnline).toBeNull());
});

test('membersAnsweredAt is null before the first answer and the answer time afterwards', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(membersAnswer(true));
  const { result } = renderMembers();
  expect(result.current.membersAnsweredAt).toBeNull();
  const requestedAt = Date.now();
  await waitFor(() => expect(result.current.membersAnsweredAt).not.toBeNull());
  expect(result.current.membersAnsweredAt).toBeGreaterThanOrEqual(requestedAt);
  expect(result.current.membersAnsweredAt).toBeLessThanOrEqual(Date.now());
});

test('membersAnsweredAt is null after a failed poll', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(membersAnswer(true))
    .mockResolvedValueOnce(jsonResponse({ body: {}, status: HttpStatus.InternalServerError }));
  const { result, poll } = renderMembers();
  await waitFor(() => expect(result.current.membersAnsweredAt).not.toBeNull());
  await poll();
  await waitFor(() => expect(result.current.membersAnsweredAt).toBeNull());
});

test('the members request carries the tab id', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(membersAnswer(true));
  renderMembers();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const requestedUrl = new URL(String(vi.mocked(fetch).mock.calls[0]![0]), window.location.origin);
  expect(requestedUrl.searchParams.get(TAB_QUERY_KEY)).toBe(tabId());
});

test('isSessionEnded is false until the poll meets a 401', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(membersAnswer(true));
  const { result } = renderMembers();
  await waitFor(() => expect(result.current.membersAnsweredAt).not.toBeNull());
  expect(result.current.isSessionEnded).toBe(false);
});

test('isSessionEnded is true once the latest poll is a 401, and a 500 does not set it', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(membersAnswer(true))
    .mockResolvedValueOnce(jsonResponse({ body: {}, status: HttpStatus.InternalServerError }))
    .mockResolvedValueOnce(jsonResponse({ body: {}, status: HttpStatus.Unauthorized }));
  const { result, poll } = renderMembers();
  await waitFor(() => expect(result.current.membersAnsweredAt).not.toBeNull());
  await poll();
  await waitFor(() => expect(result.current.membersAnsweredAt).toBeNull());
  expect(result.current.isSessionEnded).toBe(false);
  await poll();
  await waitFor(() => expect(result.current.isSessionEnded).toBe(true));
});

test('the members request carries the creator ticket when the page holds one', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(membersAnswer(true));
  renderMembers(CREATOR_TICKET);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const requestedUrl = new URL(String(vi.mocked(fetch).mock.calls[0]![0]), window.location.origin);
  expect([requestedUrl.searchParams.get(CREATOR_ATTEMPT_QUERY_KEY), requestedUrl.searchParams.get(CREATOR_EPOCH_QUERY_KEY)]).toEqual([
    String(CREATOR_TICKET.attempt),
    CREATOR_TICKET.epoch,
  ]);
});

test('the members request carries no ticket when the page holds none', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(membersAnswer(true));
  renderMembers();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const requestedUrl = new URL(String(vi.mocked(fetch).mock.calls[0]![0]), window.location.origin);
  expect([requestedUrl.searchParams.has(CREATOR_ATTEMPT_QUERY_KEY), requestedUrl.searchParams.has(CREATOR_EPOCH_QUERY_KEY)]).toEqual([
    false,
    false,
  ]);
});

test('isAttemptSuperseded is false before the first answer and follows the latest answer', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(membersAnswer(true, false)).mockResolvedValueOnce(membersAnswer(true, true));
  const { result, poll } = renderMembers(CREATOR_TICKET);
  expect(result.current.isAttemptSuperseded).toBe(false);
  await waitFor(() => expect(result.current.membersAnsweredAt).not.toBeNull());
  expect(result.current.isAttemptSuperseded).toBe(false);
  await poll();
  await waitFor(() => expect(result.current.isAttemptSuperseded).toBe(true));
});

test('isAttemptSuperseded is false after a failed poll', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(membersAnswer(true, true))
    .mockResolvedValueOnce(jsonResponse({ body: {}, status: HttpStatus.InternalServerError }));
  const { result, poll } = renderMembers(CREATOR_TICKET);
  await waitFor(() => expect(result.current.isAttemptSuperseded).toBe(true));
  await poll();
  await waitFor(() => expect(result.current.isAttemptSuperseded).toBe(false));
});
