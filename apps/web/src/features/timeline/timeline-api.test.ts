import {
  documentApiPath,
  DocumentResource,
  HttpMethod,
  HttpStatus,
  MIN_RETRY_AFTER_MS,
  MINUTE_MS,
  RETRY_AFTER_HEADER,
  SECOND_MS,
  SUMMARIZE_BUSY_MESSAGE,
  selectionSummaryApiPath,
  SelectionSummaryState,
  SummarizeStep,
  TopicState,
  type EditSelection,
  type SelectionSummaryView,
  type TopicStatus,
  type VersionSummary,
} from '@superdoc-collab/types';
import { afterEach, expect, test, vi } from 'vitest';
import { ApiRequestError, DocumentUnavailableError, requestFailedMessage } from '@/lib/api';
import { jsonResponse } from '@/testing/json-response';
import {
  fetchSelectionSummary,
  fetchTimeline,
  fetchVersion,
  requestSelectionSummary,
  SummaryTooSoonError,
  VersionLoadKind,
} from './timeline-api';
import { SUMMARIZE_EDITS_SUBJECT } from './timeline-copy';

const DOCUMENT_ID = 'doc-1';
const TIMELINE_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Timeline });
const VERSION: VersionSummary = { sequence: 7, serverTime: 1, collaborationPath: '/collaboration/versions/doc-1/7' };
const STATUS: TopicStatus = { state: TopicState.Pending, failure: null, computedAtSequence: null };
const SELECTION: EditSelection = { term: 'budget', author: 'ana', topic: 'band-0', at: 1_792_165_200_000 };
const EMPTY_SELECTION: EditSelection = { term: null, author: null, topic: null, at: null };
const NONE_VIEW: SelectionSummaryView = {
  state: SelectionSummaryState.None,
  summary: null,
  failure: null,
  isModelAvailable: true,
  step: SummarizeStep.Idle,
  partial: null,
};
const SELECTION_PATH = selectionSummaryApiPath(DOCUMENT_ID);
const TIME_ZONE = 'America/Sao_Paulo';
const ZONE_QUERY = `timeZone=${encodeURIComponent(TIME_ZONE)}`;
const UNAVAILABLE_REASON = 'The language model is unavailable: LLM_MODEL is not set on the server.';

afterEach(() => vi.restoreAllMocks());

function respondWith(response: Response) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
}

test('fetchTimeline always sends the zone and only the present filters', async () => {
  const filteredSpy = respondWith(jsonResponse({ body: { bins: [] } }));
  await fetchTimeline({ documentId: DOCUMENT_ID, filter: { term: 'a b', author: null }, timeZone: TIME_ZONE });
  expect(filteredSpy).toHaveBeenLastCalledWith(`${TIMELINE_PATH}?${ZONE_QUERY}&term=a+b`, expect.anything());
  const bareSpy = respondWith(jsonResponse({ body: { bins: [] } }));
  await fetchTimeline({ documentId: DOCUMENT_ID, filter: { term: null, author: null }, timeZone: TIME_ZONE });
  expect(bareSpy).toHaveBeenLastCalledWith(`${TIMELINE_PATH}?${ZONE_QUERY}`, expect.anything());
});

test('fetchTimeline throws DocumentUnavailableError on 404', async () => {
  respondWith(new Response(null, { status: HttpStatus.NotFound }));
  await expect(
    fetchTimeline({ documentId: DOCUMENT_ID, filter: { term: null, author: null }, timeZone: TIME_ZONE }),
  ).rejects.toBeInstanceOf(DocumentUnavailableError);
});

test('fetchVersion maps 202, 200 and 503 and throws on 404', async () => {
  respondWith(new Response(null, { status: HttpStatus.Accepted, headers: { [RETRY_AFTER_HEADER]: '2' } }));
  expect(await fetchVersion({ documentId: DOCUMENT_ID, sequence: 7 })).toEqual({ kind: VersionLoadKind.Pending, retryAfterMs: 2000 });
  respondWith(jsonResponse({ body: VERSION }));
  expect(await fetchVersion({ documentId: DOCUMENT_ID, sequence: 7 })).toEqual({ kind: VersionLoadKind.Ready, version: VERSION });
  respondWith(new Response(null, { status: HttpStatus.ServiceUnavailable }));
  expect(await fetchVersion({ documentId: DOCUMENT_ID, sequence: 7 })).toEqual({ kind: VersionLoadKind.Failed });
  respondWith(new Response(null, { status: HttpStatus.NotFound }));
  await expect(fetchVersion({ documentId: DOCUMENT_ID, sequence: 7 })).rejects.toBeInstanceOf(DocumentUnavailableError);
});

test('fetchVersion never retries faster than the minimum delay', async () => {
  respondWith(new Response(null, { status: HttpStatus.Accepted }));
  expect(await fetchVersion({ documentId: DOCUMENT_ID, sequence: 7 })).toEqual({
    kind: VersionLoadKind.Pending,
    retryAfterMs: MIN_RETRY_AFTER_MS,
  });
  respondWith(new Response(null, { status: HttpStatus.Accepted, headers: { [RETRY_AFTER_HEADER]: 'soon' } }));
  expect(await fetchVersion({ documentId: DOCUMENT_ID, sequence: 7 })).toEqual({
    kind: VersionLoadKind.Pending,
    retryAfterMs: MIN_RETRY_AFTER_MS,
  });
  respondWith(new Response(null, { status: HttpStatus.Accepted, headers: { [RETRY_AFTER_HEADER]: '0' } }));
  expect(await fetchVersion({ documentId: DOCUMENT_ID, sequence: 7 })).toEqual({
    kind: VersionLoadKind.Pending,
    retryAfterMs: MIN_RETRY_AFTER_MS,
  });
});

const SELECTION_QUERY = `term=budget&author=ana&topic=band-0&at=${SELECTION.at}`;

test('a selection summary URL carries the present parts and a bin size only with a period', async () => {
  const cases: { selection: EditSelection; binMs: number | null; path: string }[] = [
    { selection: SELECTION, binMs: null, path: `${SELECTION_PATH}?${ZONE_QUERY}&${SELECTION_QUERY}` },
    { selection: SELECTION, binMs: MINUTE_MS, path: `${SELECTION_PATH}?${ZONE_QUERY}&${SELECTION_QUERY}&binMs=${MINUTE_MS}` },
    { selection: EMPTY_SELECTION, binMs: MINUTE_MS, path: `${SELECTION_PATH}?${ZONE_QUERY}` },
    { selection: EMPTY_SELECTION, binMs: null, path: `${SELECTION_PATH}?${ZONE_QUERY}` },
  ];
  const requested = await cases.reduce<Promise<string[]>>(async (previous, { selection, binMs }) => {
    const paths = await previous;
    const fetchSpy = respondWith(jsonResponse({ body: NONE_VIEW }));
    expect(await fetchSelectionSummary({ documentId: DOCUMENT_ID, selection, binMs, timeZone: TIME_ZONE })).toEqual(NONE_VIEW);
    return [...paths, String(fetchSpy.mock.lastCall![0])];
  }, Promise.resolve([]));
  expect(requested).toEqual(cases.map(({ path }) => path));
});

test('requesting a summary posts the same selection', async () => {
  const fetchSpy = respondWith(jsonResponse({ body: NONE_VIEW, status: HttpStatus.Accepted }));
  await requestSelectionSummary({ documentId: DOCUMENT_ID, selection: SELECTION, binMs: null, timeZone: TIME_ZONE });
  expect(fetchSpy).toHaveBeenCalledWith(
    `${SELECTION_PATH}?${ZONE_QUERY}&${SELECTION_QUERY}`,
    expect.objectContaining({ method: HttpMethod.Post }),
  );
});

test('a summary requested too soon carries the wait from Retry-After', async () => {
  respondWith(
    jsonResponse({
      body: { error: SUMMARIZE_BUSY_MESSAGE },
      status: HttpStatus.TooManyRequests,
      headers: { [RETRY_AFTER_HEADER]: '12' },
    }),
  );
  const error = await requestSelectionSummary({ documentId: DOCUMENT_ID, selection: SELECTION, binMs: null, timeZone: TIME_ZONE }).catch(
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(SummaryTooSoonError);
  expect(error).toMatchObject({ message: SUMMARIZE_BUSY_MESSAGE, retryAfterMs: 12 * SECOND_MS });
});

test.each([null, 'soon'])('a Retry-After of %s waits the shortest retry', async (header) => {
  const headers = header === null ? undefined : { [RETRY_AFTER_HEADER]: header };
  respondWith(new Response('{}', { status: HttpStatus.TooManyRequests, headers }));
  await expect(
    requestSelectionSummary({ documentId: DOCUMENT_ID, selection: SELECTION, binMs: null, timeZone: TIME_ZONE }),
  ).rejects.toMatchObject({
    retryAfterMs: MIN_RETRY_AFTER_MS,
  });
});

test('an unavailable model surfaces the server reason', async () => {
  respondWith(jsonResponse({ body: { error: UNAVAILABLE_REASON }, status: HttpStatus.ServiceUnavailable }));
  await expect(
    requestSelectionSummary({ documentId: DOCUMENT_ID, selection: SELECTION, binMs: null, timeZone: TIME_ZONE }),
  ).rejects.toEqual(new ApiRequestError(UNAVAILABLE_REASON));
});

test('a 503 without a JSON error falls back to the status message', async () => {
  respondWith(new Response('<html>busy</html>', { status: HttpStatus.ServiceUnavailable }));
  await expect(
    requestSelectionSummary({ documentId: DOCUMENT_ID, selection: SELECTION, binMs: null, timeZone: TIME_ZONE }),
  ).rejects.toEqual(new ApiRequestError(requestFailedMessage({ subject: SUMMARIZE_EDITS_SUBJECT, status: HttpStatus.ServiceUnavailable })));
});

test('a selection summary of a document that is gone is unavailable', async () => {
  respondWith(new Response('{}', { status: HttpStatus.NotFound }));
  await expect(
    fetchSelectionSummary({ documentId: DOCUMENT_ID, selection: SELECTION, binMs: null, timeZone: TIME_ZONE }),
  ).rejects.toBeInstanceOf(DocumentUnavailableError);
});

test.each([HttpStatus.Forbidden, HttpStatus.ServiceUnavailable])(
  'reading a selection summary answered with %s fails with the status message',
  async (status) => {
    respondWith(new Response('{}', { status }));
    await expect(
      fetchSelectionSummary({ documentId: DOCUMENT_ID, selection: SELECTION, binMs: null, timeZone: TIME_ZONE }),
    ).rejects.toEqual(new ApiRequestError(requestFailedMessage({ subject: 'Selection summary request', status })));
  },
);
