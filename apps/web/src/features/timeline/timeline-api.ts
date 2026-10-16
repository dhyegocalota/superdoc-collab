import {
  DOCUMENT_UNAVAILABLE_MESSAGE,
  documentApiPath,
  DocumentResource,
  HttpMethod,
  HttpStatus,
  TimelineQueryParam,
  timelineEditsApiPath,
  TOPICS_REFRESH_TOO_SOON_MESSAGE,
  topicsRefreshApiPath,
  versionApiPath,
  type BinEdits,
  type DocumentTimeline,
  type TimelineFilter,
  type TopicStatus,
  type TopicSummaries,
  type VersionSummary,
} from '@superdoc-history/types';
import { ApiRequestError, apiGet, apiSend } from '@/lib/api';
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/documents-api';
import { DocumentUnavailableError } from '@/features/editor/editor-api';

export const TIMELINE_POLL_MS = 3000;

const RETRY_AFTER_HEADER = 'Retry-After';
const MILLISECONDS_PER_SECOND = 1000;
const EDITS_SEGMENT = 'edits';

export enum VersionLoadKind {
  Ready = 'ready',
  Pending = 'pending',
  Failed = 'failed',
}

export type VersionLoad =
  | { kind: VersionLoadKind.Ready; version: VersionSummary }
  | { kind: VersionLoadKind.Pending; retryAfterMs: number }
  | { kind: VersionLoadKind.Failed };

export function timelineQueryKey({ documentId, filter }: { documentId: string; filter: TimelineFilter }): unknown[] {
  return [...DOCUMENTS_QUERY_KEY, documentId, DocumentResource.Timeline, filter];
}

export function summariesQueryKey(documentId: string): string[] {
  return [...DOCUMENTS_QUERY_KEY, documentId, DocumentResource.Summaries];
}

export function topicsQueryKey(documentId: string): string[] {
  return [...DOCUMENTS_QUERY_KEY, documentId, DocumentResource.Topics];
}

export function binEditsQueryKey({ documentId, binStart, binMs, filter }: { documentId: string; binStart: number; binMs: number; filter: TimelineFilter }): unknown[] {
  return [...DOCUMENTS_QUERY_KEY, documentId, DocumentResource.Timeline, EDITS_SEGMENT, binStart, binMs, filter];
}

export function versionQueryKey({ documentId, sequence }: { documentId: string; sequence: number }): unknown[] {
  return [...DOCUMENTS_QUERY_KEY, documentId, DocumentResource.Versions, sequence];
}

function withQuery({ path, params }: { path: string; params: URLSearchParams }): string {
  const query = params.toString();
  if (!query) return path;
  return `${path}?${query}`;
}

function filterParams(filter: TimelineFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.term) params.set(TimelineQueryParam.Term, filter.term);
  if (filter.author) params.set(TimelineQueryParam.Author, filter.author);
  return params;
}

function assertDocumentAvailable(response: Response): void {
  if (response.status === HttpStatus.NotFound) throw new DocumentUnavailableError(DOCUMENT_UNAVAILABLE_MESSAGE);
}

export async function fetchTimeline({ documentId, filter }: { documentId: string; filter: TimelineFilter }): Promise<DocumentTimeline> {
  const path = documentApiPath({ documentId, resource: DocumentResource.Timeline });
  const response = await apiGet(withQuery({ path, params: filterParams(filter) }));
  assertDocumentAvailable(response);
  if (!response.ok) throw new ApiRequestError(`Timeline request failed with status ${response.status}`);
  return response.json();
}

export async function fetchSummaries(documentId: string): Promise<TopicSummaries> {
  const response = await apiGet(documentApiPath({ documentId, resource: DocumentResource.Summaries }));
  assertDocumentAvailable(response);
  if (!response.ok) throw new ApiRequestError(`Summaries request failed with status ${response.status}`);
  return response.json();
}

export async function refreshTopics(documentId: string): Promise<TopicStatus> {
  const response = await apiSend({ path: topicsRefreshApiPath(documentId), method: HttpMethod.Post, body: null });
  assertDocumentAvailable(response);
  if (response.status === HttpStatus.TooManyRequests) throw new ApiRequestError(TOPICS_REFRESH_TOO_SOON_MESSAGE);
  if (!response.ok) throw new ApiRequestError(`Topics refresh failed with status ${response.status}`);
  return response.json();
}

export async function fetchBinEdits({ documentId, binStart, binMs, filter }: { documentId: string; binStart: number; binMs: number; filter: TimelineFilter }): Promise<BinEdits> {
  const params = filterParams(filter);
  params.set(TimelineQueryParam.BinStart, String(binStart));
  params.set(TimelineQueryParam.BinMs, String(binMs));
  const response = await apiGet(withQuery({ path: timelineEditsApiPath(documentId), params }));
  assertDocumentAvailable(response);
  if (!response.ok) throw new ApiRequestError(`Bin edits request failed with status ${response.status}`);
  return response.json();
}

export async function fetchVersion({ documentId, sequence }: { documentId: string; sequence: number }): Promise<VersionLoad> {
  const response = await apiGet(versionApiPath({ documentId, sequence }));
  assertDocumentAvailable(response);
  if (response.status === HttpStatus.Accepted) return { kind: VersionLoadKind.Pending, retryAfterMs: Number(response.headers.get(RETRY_AFTER_HEADER)) * MILLISECONDS_PER_SECOND };
  if (!response.ok) return { kind: VersionLoadKind.Failed };
  return { kind: VersionLoadKind.Ready, version: await response.json() };
}
