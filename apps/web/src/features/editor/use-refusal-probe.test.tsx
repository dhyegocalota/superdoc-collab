import { ConnectionFailureReason, HEAVY_ROOMS_FULL_MESSAGE, HEAVY_ROOMS_USER_CAP_MESSAGE, HttpStatus } from '@superdoc-collab/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { useRefusalProbe } from './use-refusal-probe';

afterEach(() => vi.restoreAllMocks());

function probeWith(failureReason: ConnectionFailureReason | null) {
  const queryClient = new QueryClient();
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return renderHook(() => useRefusalProbe({ documentId: DOCUMENT_ID, failureReason }), { wrapper });
}

test.each([null, ConnectionFailureReason.Unknown, ConnectionFailureReason.SessionEnded, ConnectionFailureReason.ConnectionFailed])(
  'a failure of %s is passed on as it is, without asking the server',
  (failureReason) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = probeWith(failureReason);
    expect(result.current).toEqual({ failureReason, failureMessage: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  },
);

test.each([HEAVY_ROOMS_FULL_MESSAGE, HEAVY_ROOMS_USER_CAP_MESSAGE])(
  'an access denial answered by a 503 with a sentence is the heavy rooms refusal carrying that sentence, and names no reason before the server answered',
  async (message) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ body: { error: message }, status: HttpStatus.ServiceUnavailable }));
    const { result } = probeWith(ConnectionFailureReason.AccessDenied);
    expect(result.current).toEqual({ failureReason: null, failureMessage: null });
    await waitFor(() => expect(result.current).toEqual({ failureReason: ConnectionFailureReason.HeavyRoomsFull, failureMessage: message }));
  },
);

test.each([HttpStatus.Forbidden, HttpStatus.NotFound, HttpStatus.Ok, HttpStatus.InternalServerError])(
  'an access denial answered by %i stays an access denial',
  async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ body: {}, status }));
    const { result } = probeWith(ConnectionFailureReason.AccessDenied);
    await waitFor(() => expect(result.current.failureReason).toBe(ConnectionFailureReason.AccessDenied));
    expect(result.current.failureMessage).toBeNull();
  },
);

test('an access denial the server cannot be asked about stays an access denial', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
  const { result } = probeWith(ConnectionFailureReason.AccessDenied);
  await waitFor(() => expect(result.current.failureReason).toBe(ConnectionFailureReason.AccessDenied));
});
