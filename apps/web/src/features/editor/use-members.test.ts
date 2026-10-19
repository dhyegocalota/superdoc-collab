import { HttpStatus, TAB_QUERY_KEY } from '@superdoc-collab/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { tabId } from '@/lib/tab-id';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { jsonResponse } from '@/testing/json-response';
import { membersQueryKey } from './editor-api';
import { useMembers } from './use-members';

function membersAnswer({ isCurrentUserOnline }: { isCurrentUserOnline: boolean }): Response {
  return jsonResponse({ body: { members: [], isCurrentUserOnline } });
}

function renderMembers() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  const rendered = renderHook(() => useMembers(DOCUMENT_ID), { wrapper });
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
  vi.mocked(fetch)
    .mockResolvedValueOnce(membersAnswer({ isCurrentUserOnline: true }))
    .mockResolvedValueOnce(membersAnswer({ isCurrentUserOnline: false }));
  const { result, poll } = renderMembers();
  await waitFor(() => expect(result.current.isCurrentUserOnline).toBe(true));
  await poll();
  await waitFor(() => expect(result.current.isCurrentUserOnline).toBe(false));
});

test('isCurrentUserOnline is null after a failed poll', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(membersAnswer({ isCurrentUserOnline: true }))
    .mockResolvedValueOnce(jsonResponse({ body: {}, status: HttpStatus.InternalServerError }));
  const { result, poll } = renderMembers();
  await waitFor(() => expect(result.current.isCurrentUserOnline).toBe(true));
  await poll();
  await waitFor(() => expect(result.current.isCurrentUserOnline).toBeNull());
});

test('membersAnsweredAt is null before the first answer and the answer time afterwards', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(membersAnswer({ isCurrentUserOnline: true }));
  const { result } = renderMembers();
  expect(result.current.membersAnsweredAt).toBeNull();
  const requestedAt = Date.now();
  await waitFor(() => expect(result.current.membersAnsweredAt).not.toBeNull());
  expect(result.current.membersAnsweredAt).toBeGreaterThanOrEqual(requestedAt);
  expect(result.current.membersAnsweredAt).toBeLessThanOrEqual(Date.now());
});

test('membersAnsweredAt is null after a failed poll', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(membersAnswer({ isCurrentUserOnline: true }))
    .mockResolvedValueOnce(jsonResponse({ body: {}, status: HttpStatus.InternalServerError }));
  const { result, poll } = renderMembers();
  await waitFor(() => expect(result.current.membersAnsweredAt).not.toBeNull());
  await poll();
  await waitFor(() => expect(result.current.membersAnsweredAt).toBeNull());
});

test('the members request carries the tab id', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(membersAnswer({ isCurrentUserOnline: true }));
  renderMembers();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const requestedUrl = new URL(String(vi.mocked(fetch).mock.calls[0]![0]), window.location.origin);
  expect(requestedUrl.searchParams.get(TAB_QUERY_KEY)).toBe(tabId());
});

test('isSessionEnded is false until the poll meets a 401', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(membersAnswer({ isCurrentUserOnline: true }));
  const { result } = renderMembers();
  await waitFor(() => expect(result.current.membersAnsweredAt).not.toBeNull());
  expect(result.current.isSessionEnded).toBe(false);
});

test('isSessionEnded is true once the latest poll is a 401, and a 500 does not set it', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(membersAnswer({ isCurrentUserOnline: true }))
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

test('the members request carries the tab id and no ticket', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(membersAnswer({ isCurrentUserOnline: true }));
  renderMembers();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const requestedUrl = new URL(String(vi.mocked(fetch).mock.calls[0]![0]), window.location.origin);
  expect(requestedUrl.searchParams.get(TAB_QUERY_KEY)).toBe(tabId());
});
