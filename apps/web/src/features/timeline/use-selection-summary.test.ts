import { HttpStatus, SelectionSummaryState, type EditSelection, type SelectionSummaryView } from '@superdoc-history/types';
import { waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { DOCUMENT_ID } from '@/test/opened-document';
import { renderHookWithRouter } from '@/test/render-with-providers';
import { TIMELINE_POLL_MS } from './timeline-api';
import { useSelectionSummary } from './use-selection-summary';

const SELECTION: EditSelection = { term: null, author: null, topic: null, at: null };
const POLL_COUNT = 3;

function viewIn(state: SelectionSummaryState): SelectionSummaryView {
  return { state, summary: null, failure: null, isModelAvailable: true };
}

function respondWith(response: () => Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response());
}

async function pollsAfterFirstRead(status: () => Response): Promise<number> {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const fetchSpy = respondWith(status);
  const { result } = renderHookWithRouter(() => useSelectionSummary({ documentId: DOCUMENT_ID, selection: SELECTION, isOpen: true, timelineVolume: null }));
  await waitFor(() => expect(result.current.isFetched).toBe(true));
  await vi.advanceTimersByTimeAsync(TIMELINE_POLL_MS * POLL_COUNT);
  return fetchSpy.mock.calls.length - 1;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test('a running summary is polled until it settles', async () => {
  expect(await pollsAfterFirstRead(() => new Response(JSON.stringify(viewIn(SelectionSummaryState.Running))))).toBeGreaterThanOrEqual(POLL_COUNT - 1);
});

test.each([SelectionSummaryState.None, SelectionSummaryState.Ready, SelectionSummaryState.Failed])('a %s summary is not polled', async (state) => {
  expect(await pollsAfterFirstRead(() => new Response(JSON.stringify(viewIn(state))))).toBe(0);
});

test('a document that is gone stops the polling', async () => {
  expect(await pollsAfterFirstRead(() => new Response('{}', { status: HttpStatus.NotFound }))).toBe(0);
});
