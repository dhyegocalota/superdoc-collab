import {
  DOCUMENT_UNAVAILABLE_MESSAGE,
  documentApiPath,
  DocumentResource,
  HttpMethod,
  HttpStatus,
  MIN_RETRY_AFTER_MS,
  RETRY_AFTER_HEADER,
  SECOND_MS,
  SELECTION_SUMMARY_TOO_SOON_MESSAGE,
  selectionSummaryApiPath,
  TimelineQueryParam,
  timelineEditsApiPath,
  TOPICS_REFRESH_TOO_SOON_MESSAGE,
  topicsRefreshApiPath,
  versionApiPath,
  type BinEdits,
  type DocumentTimeline,
  type EditSelection,
  type SelectionSummaryView,
  type TimelineFilter,
  type TopicStatus,
  type TopicSummaries,
  type VersionSummary,
} from '@superdoc-history/types';
import { ApiRequestError, apiGet, apiSend } from '@/lib/api';
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/documents-api';
import { DocumentUnavailableError } from '@/features/editor/editor-api';
import { requestFailedMessage } from './timeline-copy';

export const TIMELINE_POLL_MS = 3 * SECOND_MS;

const EDITS_SEGMENT = 'edits';
const SELECTION_SEGMENT = 'selection';
export const SUMMARIZE_EDITS_SUBJECT = 'Summarize edits';

type ErrorBody = { error: string };

export class TopicsRefreshTooSoonError extends ApiRequestError {
  constructor(readonly retryAfterMs: number) {
    super(TOPICS_REFRESH_TOO_SOON_MESSAGE);
  }
}

export class SummaryTooSoonError extends ApiRequestError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(SELECTION_SUMMARY_TOO_SOON_MESSAGE);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

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

export function binEditsQueryKey({
  documentId,
  binStart,
  binMs,
  filter,
}: {
  documentId: string;
  binStart: number;
  binMs: number;
  filter: TimelineFilter;
}): unknown[] {
  return [...DOCUMENTS_QUERY_KEY, documentId, DocumentResource.Timeline, EDITS_SEGMENT, binStart, binMs, filter];
}

export function versionQueryKey({ documentId, sequence }: { documentId: string; sequence: number | null }): unknown[] {
  return [...DOCUMENTS_QUERY_KEY, documentId, DocumentResource.Versions, sequence];
}

export function selectionSummaryQueryKey({ documentId, selection }: { documentId: string; selection: EditSelection }): unknown[] {
  return [...summariesQueryKey(documentId), SELECTION_SEGMENT, selection];
}

export function pollWhileAvailable(query: { state: { error: Error | null } }): number | false {
  if (query.state.error instanceof DocumentUnavailableError) return false;
  return TIMELINE_POLL_MS;
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

function selectionParams({ selection, binMs }: { selection: EditSelection; binMs: number | null }): URLSearchParams {
  const params = filterParams(selection);
  if (selection.topic) params.set(TimelineQueryParam.Topic, selection.topic);
  if (selection.at !== null) params.set(TimelineQueryParam.At, String(selection.at));
  if (selection.at !== null && binMs !== null) params.set(TimelineQueryParam.BinMs, String(binMs));
  return params;
}

function isErrorBody(body: unknown): body is ErrorBody {
  return typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string';
}

async function unavailableMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (isErrorBody(body)) return body.error;
  return requestFailedMessage({ subject: SUMMARIZE_EDITS_SUBJECT, status: response.status });
}

function assertDocumentAvailable(response: Response): void {
  if (response.status === HttpStatus.NotFound) throw new DocumentUnavailableError(DOCUMENT_UNAVAILABLE_MESSAGE);
}

function readRetryAfterMs(response: Response): number {
  const retryAfterMs = Number(response.headers.get(RETRY_AFTER_HEADER)) * SECOND_MS;
  if (!Number.isFinite(retryAfterMs)) return MIN_RETRY_AFTER_MS;
  return Math.max(MIN_RETRY_AFTER_MS, retryAfterMs);
}

export async function fetchTimeline({ documentId, filter }: { documentId: string; filter: TimelineFilter }): Promise<DocumentTimeline> {
  const path = documentApiPath({ documentId, resource: DocumentResource.Timeline });
  const response = await apiGet(withQuery({ path, params: filterParams(filter) }));
  assertDocumentAvailable(response);
  if (!response.ok) throw new ApiRequestError(requestFailedMessage({ subject: 'Timeline request', status: response.status }));
  return response.json();
}

export async function fetchSummaries(documentId: string): Promise<TopicSummaries> {
  const response = await apiGet(documentApiPath({ documentId, resource: DocumentResource.Summaries }));
  assertDocumentAvailable(response);
  if (!response.ok) throw new ApiRequestError(requestFailedMessage({ subject: 'Summaries request', status: response.status }));
  return response.json();
}

export async function refreshTopics(documentId: string): Promise<TopicStatus> {
  const response = await apiSend({ path: topicsRefreshApiPath(documentId), method: HttpMethod.Post, body: null });
  assertDocumentAvailable(response);
  if (response.status === HttpStatus.TooManyRequests) throw new TopicsRefreshTooSoonError(readRetryAfterMs(response));
  if (!response.ok) throw new ApiRequestError(requestFailedMessage({ subject: 'Topics refresh', status: response.status }));
  return response.json();
}

export async function fetchSelectionSummary({
  documentId,
  selection,
  binMs,
}: {
  documentId: string;
  selection: EditSelection;
  binMs: number | null;
}): Promise<SelectionSummaryView> {
  const response = await apiGet(withQuery({ path: selectionSummaryApiPath(documentId), params: selectionParams({ selection, binMs }) }));
  assertDocumentAvailable(response);
  if (!response.ok) throw new ApiRequestError(requestFailedMessage({ subject: 'Selection summary request', status: response.status }));
  return response.json();
}

export async function requestSelectionSummary({
  documentId,
  selection,
  binMs,
}: {
  documentId: string;
  selection: EditSelection;
  binMs: number | null;
}): Promise<SelectionSummaryView> {
  const response = await apiSend({
    path: withQuery({ path: selectionSummaryApiPath(documentId), params: selectionParams({ selection, binMs }) }),
    method: HttpMethod.Post,
    body: null,
  });
  assertDocumentAvailable(response);
  if (response.status === HttpStatus.TooManyRequests) throw new SummaryTooSoonError(Math.ceil(readRetryAfterMs(response) / SECOND_MS));
  if (response.status === HttpStatus.ServiceUnavailable) throw new ApiRequestError(await unavailableMessage(response));
  if (!response.ok) throw new ApiRequestError(requestFailedMessage({ subject: SUMMARIZE_EDITS_SUBJECT, status: response.status }));
  return response.json();
}

export async function fetchBinEdits({
  documentId,
  binStart,
  binMs,
  filter,
}: {
  documentId: string;
  binStart: number;
  binMs: number;
  filter: TimelineFilter;
}): Promise<BinEdits> {
  const params = filterParams(filter);
  params.set(TimelineQueryParam.BinStart, String(binStart));
  params.set(TimelineQueryParam.BinMs, String(binMs));
  const response = await apiGet(withQuery({ path: timelineEditsApiPath(documentId), params }));
  assertDocumentAvailable(response);
  if (!response.ok) throw new ApiRequestError(requestFailedMessage({ subject: 'Bin edits request', status: response.status }));
  return response.json();
}

export async function fetchVersion({ documentId, sequence }: { documentId: string; sequence: number }): Promise<VersionLoad> {
  const response = await apiGet(versionApiPath({ documentId, sequence }));
  assertDocumentAvailable(response);
  if (response.status === HttpStatus.Accepted) return { kind: VersionLoadKind.Pending, retryAfterMs: readRetryAfterMs(response) };
  if (!response.ok) return { kind: VersionLoadKind.Failed };
  return { kind: VersionLoadKind.Ready, version: await response.json() };
}
