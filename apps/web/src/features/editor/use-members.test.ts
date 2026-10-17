import { HttpStatus } from '@superdoc-collab/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { jsonResponse } from '@/testing/json-response';
import { membersQueryKey } from './editor-api';
import { useMembers } from './use-members';

function membersAnswer(isCurrentUserOnline: boolean): Response {
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
