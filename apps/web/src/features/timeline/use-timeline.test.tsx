import { ApiPath, UserRole, type SessionUser } from '@superdoc-collab/types';
import { QueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { SESSION_QUERY_KEY } from '@/features/auth/use-session';
import { jsonResponse } from '@/testing/json-response';
import { renderHookWithRouter } from '@/testing/render-with-providers';
import { timelineWith } from '@/testing/timeline-fixtures';
import { useTimeline } from './use-timeline';

const DOCUMENT_ID = 'doc-1';
const SAO_PAULO = 'America/Sao_Paulo';
const KATHMANDU = 'Asia/Kathmandu';
const USER: SessionUser = { id: 'user-1', name: 'Ada', email: 'ada@example.com', role: UserRole.User, timeZone: SAO_PAULO };
const FILTER = { term: null, author: null };

afterEach(() => vi.restoreAllMocks());

function requestedZones(fetchSpy: { mock: { calls: unknown[][] } }): (string | null)[] {
  return fetchSpy.mock.calls
    .map(([input]) => String(input))
    .filter((input) => input.startsWith(`${ApiPath.Documents}/`))
    .map((input) => new URL(input, 'http://localhost').searchParams.get('timeZone'));
}

test('the timeline request carries the effective zone and changing the zone refetches', async () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(SESSION_QUERY_KEY, USER);
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (input === ApiPath.Me) return jsonResponse({ body: { user: queryClient.getQueryData(SESSION_QUERY_KEY) } });
    return jsonResponse({ body: timelineWith({ volumes: [[1]], names: ['Budget'] }) });
  });
  renderHookWithRouter(() => useTimeline({ documentId: DOCUMENT_ID, filter: FILTER, isOpen: true }), { queryClient });
  await waitFor(() => expect(requestedZones(fetchSpy)).toEqual([SAO_PAULO]));
  act(() => queryClient.setQueryData(SESSION_QUERY_KEY, { ...USER, timeZone: KATHMANDU }));
  await waitFor(() => expect(requestedZones(fetchSpy)).toEqual([SAO_PAULO, KATHMANDU]));
});
