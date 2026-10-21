import {
  ClientActor,
  documentPagePath,
  IMPORTED_KEY_PREFIX,
  SelectionSummaryState,
  SummarizeStep,
  type DocumentTimeline,
  type SelectionSummaryView,
} from '@superdoc-collab/types';
import type { QueryClient } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { renderHookWithRouter } from '@/testing/render-with-providers';
import { timelineWith } from '@/testing/timeline-fixtures';
import { useImportedHistorySummary } from './use-imported-history-summary';

vi.mock('@/lib/use-time-zone', () => ({ useTimeZone: () => ({ timeZone: 'UTC', source: 'account' }) }));

const ROUTE = documentPagePath(DOCUMENT_ID);
const IMPORTED_KEY = `${IMPORTED_KEY_PREFIX}dana reviewer`;
const LIVE_KEY = 'ana';

function timelineBy(authorKey: string): DocumentTimeline {
  return {
    ...timelineWith({ volumes: [[1]], names: ['General'] }),
    authors: { [authorKey]: { id: null, name: 'Dana Reviewer', actor: ClientActor.Human } },
  };
}

function viewIn(state: SelectionSummaryState): SelectionSummaryView {
  return { state, summary: null, failure: null, isModelAvailable: true, step: SummarizeStep.Idle, partial: null };
}

function mockApi({ timeline, view }: { timeline: DocumentTimeline; view: SelectionSummaryView }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const isSummary = String(input).includes('/summaries/');
    return jsonResponse({ body: isSummary ? view : timeline });
  });
}

function renderSummary({ canRequest = true, route = ROUTE }: { canRequest?: boolean; route?: string } = {}) {
  const onStart = vi.fn();
  const { queryClient } = renderHookWithRouter(
    () => useImportedHistorySummary({ documentId: DOCUMENT_ID, canRequest, isEditorReady: true, onStart }),
    { route },
  );
  return { onStart, queryClient };
}

async function settle(queryClient: QueryClient): Promise<void> {
  await waitFor(() =>
    expect(
      queryClient
        .getQueryCache()
        .findAll()
        .every((query) => query.state.fetchStatus === 'idle'),
    ).toBe(true),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

test('starts once for imported history that was never summarized', async () => {
  mockApi({ timeline: timelineBy(IMPORTED_KEY), view: viewIn(SelectionSummaryState.None) });
  const { onStart, queryClient } = renderSummary();
  await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
  await settle(queryClient);
  expect(onStart).toHaveBeenCalledTimes(1);
});

test('waits while the import runs, then starts once the imported authors arrive', async () => {
  const importing = { ...timelineBy(LIVE_KEY), projection: { ...timelineBy(LIVE_KEY).projection, isImporting: true } };
  const fetchSpy = mockApi({ timeline: importing, view: viewIn(SelectionSummaryState.None) });
  const { onStart, queryClient } = renderSummary();
  await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  await settle(queryClient);
  expect(onStart).not.toHaveBeenCalled();
  mockApi({ timeline: timelineBy(IMPORTED_KEY), view: viewIn(SelectionSummaryState.None) });
  await queryClient.invalidateQueries();
  await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
});

test('does not start for a document without imported history', async () => {
  const fetchSpy = mockApi({ timeline: timelineBy(LIVE_KEY), view: viewIn(SelectionSummaryState.None) });
  const { onStart, queryClient } = renderSummary();
  await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  await settle(queryClient);
  expect(onStart).not.toHaveBeenCalled();
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/summaries/'))).toBe(false);
});

test('does not start when the summary is already written', async () => {
  const fetchSpy = mockApi({ timeline: timelineBy(IMPORTED_KEY), view: viewIn(SelectionSummaryState.Ready) });
  const { onStart, queryClient } = renderSummary();
  await waitFor(() => expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/summaries/'))).toBe(true));
  await settle(queryClient);
  expect(onStart).not.toHaveBeenCalled();
});

test('does not start for a reader or on a filtered view', async () => {
  const fetchSpy = mockApi({ timeline: timelineBy(IMPORTED_KEY), view: viewIn(SelectionSummaryState.None) });
  const reader = renderSummary({ canRequest: false });
  const filtered = renderSummary({ route: `${ROUTE}?author=ana` });
  await settle(reader.queryClient);
  await settle(filtered.queryClient);
  expect(reader.onStart).not.toHaveBeenCalled();
  expect(filtered.onStart).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
});
