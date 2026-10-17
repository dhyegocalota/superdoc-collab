import { TimelineQueryParam, type BinEdits } from '@superdoc-collab/types';
import { waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { renderHookWithRouter } from '@/testing/render-with-providers';
import { timelineWith } from '@/testing/timeline-fixtures';
import { useBinRuns } from './use-bin-runs';

vi.mock('@/lib/use-time-zone', () => ({ useTimeZone: () => ({ timeZone: 'UTC', source: 'account' }) }));

const TIMELINE_TIME_ZONE = 'America/Sao_Paulo';
const FILTER = { term: null, author: null };
const EDITS: BinEdits = { binStart: 0, binMs: 0, runs: [], authors: {} };

afterEach(() => {
  vi.restoreAllMocks();
});

test('the edits of a bin are requested in the zone the timeline was built in', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ body: EDITS }));
  const timeline = timelineWith({ volumes: [[1]], names: ['Budget'], timeZone: TIMELINE_TIME_ZONE });
  renderHookWithRouter(() => useBinRuns({ documentId: DOCUMENT_ID, timeline, bin: timeline.bins[0], filter: FILTER }));
  await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  const requested = new URL(String(fetchSpy.mock.calls[0]![0]), 'http://localhost');
  expect(requested.searchParams.get(TimelineQueryParam.TimeZone)).toBe(TIMELINE_TIME_ZONE);
});
