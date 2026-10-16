import { documentApiPath, DocumentResource, HttpMethod, HttpStatus, TOPICS_REFRESH_TOO_SOON_MESSAGE, TopicState, topicsRefreshApiPath, type TopicStatus, type VersionSummary } from '@superdoc-history/types';
import { afterEach, expect, test, vi } from 'vitest';
import { ApiRequestError } from '@/lib/api';
import { DocumentUnavailableError } from '@/features/editor/editor-api';
import { fetchTimeline, fetchVersion, MIN_RETRY_AFTER_MS, refreshTopics, VersionLoadKind } from './timeline-api';

const DOCUMENT_ID = 'doc-1';
const TIMELINE_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Timeline });
const RETRY_AFTER_HEADER = 'Retry-After';
const VERSION: VersionSummary = { sequence: 7, serverTime: 1, collaborationPath: '/collaboration/versions/doc-1/7' };
const STATUS: TopicStatus = { state: TopicState.Pending, failure: null, computedAtSequence: null };

afterEach(() => vi.restoreAllMocks());

function respondWith(response: Response) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
}

test('fetchTimeline sends only the present filters', async () => {
  const fetchSpy = respondWith(new Response(JSON.stringify({ bins: [] })));
  await fetchTimeline({ documentId: DOCUMENT_ID, filter: { term: 'a b', author: null } });
  expect(fetchSpy).toHaveBeenCalledWith(`${TIMELINE_PATH}?term=a+b`, expect.anything());
});

test('fetchTimeline without filters requests the bare path', async () => {
  const fetchSpy = respondWith(new Response(JSON.stringify({ bins: [] })));
  await fetchTimeline({ documentId: DOCUMENT_ID, filter: { term: null, author: null } });
  expect(fetchSpy).toHaveBeenCalledWith(TIMELINE_PATH, expect.anything());
});

test('fetchTimeline throws DocumentUnavailableError on 404', async () => {
  respondWith(new Response(null, { status: HttpStatus.NotFound }));
  await expect(fetchTimeline({ documentId: DOCUMENT_ID, filter: { term: null, author: null } })).rejects.toBeInstanceOf(DocumentUnavailableError);
});

test('fetchVersion maps 202, 200 and 503 and throws on 404', async () => {
  respondWith(new Response(null, { status: HttpStatus.Accepted, headers: { [RETRY_AFTER_HEADER]: '2' } }));
  expect(await fetchVersion({ documentId: DOCUMENT_ID, sequence: 7 })).toEqual({ kind: VersionLoadKind.Pending, retryAfterMs: 2000 });
  respondWith(new Response(JSON.stringify(VERSION)));
  expect(await fetchVersion({ documentId: DOCUMENT_ID, sequence: 7 })).toEqual({ kind: VersionLoadKind.Ready, version: VERSION });
  respondWith(new Response(null, { status: HttpStatus.ServiceUnavailable }));
  expect(await fetchVersion({ documentId: DOCUMENT_ID, sequence: 7 })).toEqual({ kind: VersionLoadKind.Failed });
  respondWith(new Response(null, { status: HttpStatus.NotFound }));
  await expect(fetchVersion({ documentId: DOCUMENT_ID, sequence: 7 })).rejects.toBeInstanceOf(DocumentUnavailableError);
});

test('fetchVersion never retries faster than the minimum delay', async () => {
  respondWith(new Response(null, { status: HttpStatus.Accepted }));
  expect(await fetchVersion({ documentId: DOCUMENT_ID, sequence: 7 })).toEqual({ kind: VersionLoadKind.Pending, retryAfterMs: MIN_RETRY_AFTER_MS });
  respondWith(new Response(null, { status: HttpStatus.Accepted, headers: { [RETRY_AFTER_HEADER]: 'soon' } }));
  expect(await fetchVersion({ documentId: DOCUMENT_ID, sequence: 7 })).toEqual({ kind: VersionLoadKind.Pending, retryAfterMs: MIN_RETRY_AFTER_MS });
  respondWith(new Response(null, { status: HttpStatus.Accepted, headers: { [RETRY_AFTER_HEADER]: '0' } }));
  expect(await fetchVersion({ documentId: DOCUMENT_ID, sequence: 7 })).toEqual({ kind: VersionLoadKind.Pending, retryAfterMs: MIN_RETRY_AFTER_MS });
});

test('refreshTopics returns the status on 202 and explains a 429', async () => {
  const fetchSpy = respondWith(new Response(JSON.stringify(STATUS), { status: HttpStatus.Accepted }));
  expect(await refreshTopics(DOCUMENT_ID)).toEqual(STATUS);
  expect(fetchSpy).toHaveBeenCalledWith(topicsRefreshApiPath(DOCUMENT_ID), expect.objectContaining({ method: HttpMethod.Post }));
  respondWith(new Response(null, { status: HttpStatus.TooManyRequests }));
  await expect(refreshTopics(DOCUMENT_ID)).rejects.toThrow(new ApiRequestError(TOPICS_REFRESH_TOO_SOON_MESSAGE));
});
