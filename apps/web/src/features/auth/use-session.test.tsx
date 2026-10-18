import { ApiPath, HttpStatus, MINUTE_MS, SESSION_STALE_TIME_MS, UserRole, type SessionUser } from '@superdoc-collab/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { SESSION_QUERY_KEY, useSession } from './use-session';

const ADA: SessionUser = { id: 'user-1', name: 'Ada', email: 'ada@example.com', role: UserRole.User, timeZone: 'UTC' };
const FIVE_MINUTES = 5;

afterEach(() => vi.restoreAllMocks());

function clientWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function meRequests(calls: unknown[][]): number {
  return calls.filter(([path]) => String(path) === ApiPath.Me).length;
}

test('the session stays fresh for five minutes', () => {
  expect(SESSION_STALE_TIME_MS).toBe(FIVE_MINUTES * MINUTE_MS);
});

test('two consumers mounted one after the other ask the server once', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ body: { user: ADA } }));
  const queryClient = newQueryClient();
  const first = renderHook(useSession, { wrapper: clientWrapper(queryClient) });
  await waitFor(() => expect(first.result.current.user).toEqual(ADA));
  const second = renderHook(useSession, { wrapper: clientWrapper(queryClient) });
  await waitFor(() => expect(second.result.current.user).toEqual(ADA));
  expect(meRequests(fetchSpy.mock.calls)).toBe(1);
});

test('a 401 reads as a signed out session', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ body: {}, status: HttpStatus.Unauthorized }));
  const { result } = renderHook(useSession, { wrapper: clientWrapper(newQueryClient()) });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.user).toBeNull();
});

test('a 401 on a refetch replaces the last good user with a signed out session', async () => {
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => jsonResponse({ body: {}, status: HttpStatus.Unauthorized }));
  const queryClient = newQueryClient();
  queryClient.setQueryData(SESSION_QUERY_KEY, ADA);
  const { result } = renderHook(useSession, { wrapper: clientWrapper(queryClient) });
  await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  await waitFor(() => expect(result.current.user).toBeNull());
  expect(meRequests(fetchSpy.mock.calls)).toBeGreaterThan(0);
});

test('another failure keeps the query in error and does not read as signed out', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ body: {}, status: HttpStatus.ServiceUnavailable }));
  const queryClient = newQueryClient();
  renderHook(useSession, { wrapper: clientWrapper(queryClient) });
  await waitFor(() => expect(queryClient.getQueryState(SESSION_QUERY_KEY)?.status).toBe('error'));
});
