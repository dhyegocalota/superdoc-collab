import { ApiPath, HttpStatus, UserRole, type SessionUser } from '@superdoc-collab/types';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { createTestQueryClient, renderHookWithRouter } from '@/testing/render-with-providers';
import { SESSION_QUERY_KEY, useSession } from './use-session';

const ADA: SessionUser = {
  id: 'user-1',
  name: 'Ada',
  email: 'ada@example.com',
  role: UserRole.User,
  timeZone: 'UTC',
  impersonatedBy: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});

function meRequests(calls: unknown[][]): number {
  return calls.filter(([path]) => String(path) === ApiPath.Me).length;
}

function mockSignedInSession() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ body: { user: ADA } }));
}

test('two consumers mounted one after the other ask the server once', async () => {
  const fetchSpy = mockSignedInSession();
  const queryClient = createTestQueryClient();
  const first = renderHookWithRouter(useSession, { queryClient });
  await waitFor(() => expect(first.result.current.user).toEqual(ADA));
  const second = renderHookWithRouter(useSession, { queryClient });
  await waitFor(() => expect(second.result.current.user).toEqual(ADA));
  expect(meRequests(fetchSpy.mock.calls)).toBe(1);
});

test('a window focus asks the server again even inside the stale window', async () => {
  const fetchSpy = mockSignedInSession();
  const { result } = renderHookWithRouter(useSession, { queryClient: createTestQueryClient() });
  await waitFor(() => expect(result.current.user).toEqual(ADA));
  focusManager.setFocused(false);
  focusManager.setFocused(true);
  await waitFor(() => expect(meRequests(fetchSpy.mock.calls)).toBe(2));
});

test('coming back online asks the server again even inside the stale window', async () => {
  const fetchSpy = mockSignedInSession();
  const { result } = renderHookWithRouter(useSession, { queryClient: createTestQueryClient() });
  await waitFor(() => expect(result.current.user).toEqual(ADA));
  onlineManager.setOnline(false);
  onlineManager.setOnline(true);
  await waitFor(() => expect(meRequests(fetchSpy.mock.calls)).toBe(2));
});

test('a failed refetch keeps the last good user and the query in error', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ body: {}, status: HttpStatus.ServiceUnavailable }));
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(SESSION_QUERY_KEY, ADA);
  const { result } = renderHookWithRouter(useSession, { queryClient });
  await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  await waitFor(() => expect(queryClient.getQueryState(SESSION_QUERY_KEY)?.status).toBe('error'));
  expect(result.current.user).toEqual(ADA);
});
