import {
  HttpStatus,
  SelectionSummaryState,
  SummarizeStep,
  TimelineQueryParam,
  type EditSelection,
  type SelectionSummaryView,
} from '@superdoc-collab/types';
import { waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { renderHookWithRouter } from '@/testing/render-with-providers';
import { TIMELINE_POLL_MS } from './timeline-api';
import { useSelectionSummary } from './use-selection-summary';

vi.mock('@/lib/use-time-zone', () => ({ useTimeZone: () => ({ timeZone: 'UTC', source: 'account' }) }));

const SELECTION: EditSelection = { term: null, author: null, topic: null, at: null };
const POLL_COUNT = 3;
const TIMELINE_TIME_ZONE = 'America/Sao_Paulo';

function viewIn(state: SelectionSummaryState, step: SummarizeStep = SummarizeStep.Idle): SelectionSummaryView {
  return { state, summary: null, failure: null, isModelAvailable: true, step };
}

function respondWith(response: () => Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response());
}

async function pollsAfterFirstRead(status: () => Response): Promise<number> {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const fetchSpy = respondWith(status);
  const { result } = renderHookWithRouter(() =>
    useSelectionSummary({
      documentId: DOCUMENT_ID,
      selection: SELECTION,
      binMs: null,
      timeZone: TIMELINE_TIME_ZONE,
      isOpen: true,
      timelineStamp: null,
    }),
  );
  await waitFor(() => expect(result.current.isFetched).toBe(true));
  await vi.advanceTimersByTimeAsync(TIMELINE_POLL_MS * POLL_COUNT);
  return fetchSpy.mock.calls.length - 1;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test('a running summary is polled until it settles', async () => {
  expect(await pollsAfterFirstRead(() => jsonResponse({ body: viewIn(SelectionSummaryState.Running) }))).toBeGreaterThanOrEqual(
    POLL_COUNT - 1,
  );
});

test('polls while step is not idle and stops at idle', async () => {
  const steps = [SummarizeStep.Grouping, SummarizeStep.Summarizing, SummarizeStep.Idle];
  let reads = 0;
  const pollCount = await pollsAfterFirstRead(() => {
    const step = steps[Math.min(reads, steps.length - 1)]!;
    reads += 1;
    return jsonResponse({ body: viewIn(SelectionSummaryState.None, step) });
  });
  expect(pollCount).toBe(steps.length - 1);
});

test.each([SelectionSummaryState.None, SelectionSummaryState.Ready, SelectionSummaryState.Failed])(
  'a %s summary is not polled',
  async (state) => {
    expect(await pollsAfterFirstRead(() => jsonResponse({ body: viewIn(state) }))).toBe(0);
  },
);

test('a document that is gone stops the polling', async () => {
  expect(await pollsAfterFirstRead(() => new Response('{}', { status: HttpStatus.NotFound }))).toBe(0);
});

test('the summary is requested in the zone the timeline was built in', async () => {
  const fetchSpy = respondWith(() => jsonResponse({ body: viewIn(SelectionSummaryState.None) }));
  const { result } = renderHookWithRouter(() =>
    useSelectionSummary({
      documentId: DOCUMENT_ID,
      selection: SELECTION,
      binMs: null,
      timeZone: TIMELINE_TIME_ZONE,
      isOpen: true,
      timelineStamp: null,
    }),
  );
  await waitFor(() => expect(result.current.isFetched).toBe(true));
  const requested = new URL(String(fetchSpy.mock.calls[0]![0]), 'http://localhost');
  expect(requested.searchParams.get(TimelineQueryParam.TimeZone)).toBe(TIMELINE_TIME_ZONE);
});
