import {
  documentPagePath,
  HttpStatus,
  RETRY_AFTER_HEADER,
  SelectionSummaryState,
  SummarizeOutcome,
  SummarizeStep,
  TimelineQueryParam,
  UTC_TIME_ZONE,
  type SummarizeResponse,
} from '@superdoc-collab/types';
import { act, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { createTestQueryClient, renderHookWithRouter } from '@/testing/render-with-providers';
import { timelineWith } from '@/testing/timeline-fixtures';
import { selectionSummaryQueryKey, SummaryTooSoonError, timelineQueryKey } from './timeline-api';
import { useSummarize } from './use-summarize';

vi.mock('@/lib/use-time-zone', () => ({ useTimeZone: () => ({ timeZone: 'UTC', source: 'account' }) }));

const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';
const RETRY_AFTER_SECONDS = 12;
const SELECTION = { term: 'budget', author: 'bruno', topic: 'band-1', at: 1_792_165_200_000 };
const ROUTE = `${documentPagePath(DOCUMENT_ID)}?term=budget&author=bruno&topic=band-1&at=${SELECTION.at}`;

function responseWith({ outcome, step }: { outcome: SummarizeOutcome; step: SummarizeStep }): SummarizeResponse {
  return { state: SelectionSummaryState.None, summary: null, failure: null, isModelAvailable: true, step, outcome };
}

afterEach(() => {
  vi.restoreAllMocks();
});

test('posts the selection of the URL in the zone and bin width of the cached timeline', async () => {
  const queryClient = createTestQueryClient();
  const timeline = timelineWith({ volumes: [[1]], names: ['Budget'], timeZone: SAO_PAULO_TIME_ZONE });
  queryClient.setQueryData(
    timelineQueryKey({ documentId: DOCUMENT_ID, filter: { term: SELECTION.term, author: SELECTION.author }, timeZone: UTC_TIME_ZONE }),
    timeline,
  );
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () =>
      jsonResponse({ body: responseWith({ outcome: SummarizeOutcome.Started, step: SummarizeStep.Grouping }) }),
    );
  const { result } = renderHookWithRouter(() => useSummarize({ documentId: DOCUMENT_ID }), { route: ROUTE, queryClient });
  act(() => result.current.summarize());
  await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  const requested = new URL(String(fetchSpy.mock.calls[0]![0]), 'http://localhost');
  expect(requested.searchParams.get(TimelineQueryParam.Term)).toBe(SELECTION.term);
  expect(requested.searchParams.get(TimelineQueryParam.Author)).toBe(SELECTION.author);
  expect(requested.searchParams.get(TimelineQueryParam.Topic)).toBe(SELECTION.topic);
  expect(requested.searchParams.get(TimelineQueryParam.At)).toBe(String(SELECTION.at));
  expect(requested.searchParams.get(TimelineQueryParam.TimeZone)).toBe(SAO_PAULO_TIME_ZONE);
  expect(requested.searchParams.get(TimelineQueryParam.BinMs)).toBe(String(timeline.binMs));
});

test('is running from the click until the polled step returns to idle, and reports the outcome', async () => {
  const queryClient = createTestQueryClient();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    jsonResponse({ body: responseWith({ outcome: SummarizeOutcome.Started, step: SummarizeStep.Grouping }), status: HttpStatus.Accepted }),
  );
  const { result } = renderHookWithRouter(() => useSummarize({ documentId: DOCUMENT_ID }), { route: ROUTE, queryClient });
  expect(result.current.isRunning).toBe(false);
  expect(result.current.outcome).toBeNull();
  act(() => result.current.summarize());
  await waitFor(() => expect(result.current.outcome).toBe(SummarizeOutcome.Started));
  expect(result.current.isRunning).toBe(true);
  act(() => {
    queryClient.setQueryData(
      selectionSummaryQueryKey({ documentId: DOCUMENT_ID, selection: SELECTION, timeZone: UTC_TIME_ZONE }),
      responseWith({ outcome: SummarizeOutcome.Started, step: SummarizeStep.Idle }),
    );
  });
  await waitFor(() => expect(result.current.isRunning).toBe(false));
});

test('a busy answer is an error that carries the seconds to wait', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    jsonResponse({
      body: { error: 'busy' },
      status: HttpStatus.TooManyRequests,
      headers: { [RETRY_AFTER_HEADER]: String(RETRY_AFTER_SECONDS) },
    }),
  );
  const { result } = renderHookWithRouter(() => useSummarize({ documentId: DOCUMENT_ID }), { route: ROUTE });
  act(() => result.current.summarize());
  await waitFor(() => expect(result.current.error).toBeInstanceOf(SummaryTooSoonError));
  expect(result.current.retryAfterSeconds).toBe(RETRY_AFTER_SECONDS);
  expect(result.current.isRunning).toBe(false);
});
