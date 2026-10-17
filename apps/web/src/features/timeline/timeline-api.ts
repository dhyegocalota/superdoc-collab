import {
  documentApiPath,
  DocumentResource,
  HttpMethod,
  HttpStatus,
  MIN_RETRY_AFTER_MS,
  RETRY_AFTER_HEADER,
  SECOND_MS,
  SUMMARIZE_BUSY_MESSAGE,
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
  type SummarizeResponse,
  type TimelineFilter,
  type TopicStatus,
  type TopicSummaries,
  type VersionSummary,
} from '@superdoc-collab/types';
import { ApiRequestError, apiGet, apiSend, assertDocumentAvailable, readJson, requestFailedMessage, RetryLaterError } from '@/lib/api';
import { documentQueryKey } from '@/features/documents/documents-api';
import { SUMMARIZE_EDITS_SUBJECT, TOPICS_REFRESH_SUBJECT } from './timeline-copy';

export const TIMELINE_POLL_MS = 3 * SECOND_MS;

const EDITS_SEGMENT = 'edits';
const SELECTION_SEGMENT = 'selection';

type ErrorBody = { error: string };

export class TopicsRefreshTooSoonError extends RetryLaterError {
  constructor(retryAfterMs: number) {
    super({ message: TOPICS_REFRESH_TOO_SOON_MESSAGE, retryAfterMs });
  }
}

export class SummaryTooSoonError extends RetryLaterError {
  constructor(retryAfterMs: number) {
    super({ message: SUMMARIZE_BUSY_MESSAGE, retryAfterMs });
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

export function timelineQueryKey({
  documentId,
  filter,
  timeZone,
}: {
  documentId: string;
  filter: TimelineFilter;
  timeZone: string;
}): unknown[] {
  return documentQueryKey({ documentId, segments: [DocumentResource.Timeline, filter, timeZone] });
}

export function summariesQueryKey(documentId: string): unknown[] {
  return documentQueryKey({ documentId, segments: [DocumentResource.Summaries] });
}

export function topicsQueryKey(documentId: string): unknown[] {
  return documentQueryKey({ documentId, segments: [DocumentResource.Topics] });
}

export function binEditsQueryKey({
  documentId,
  binStart,
  binMs,
  filter,
  timeZone,
}: {
  documentId: string;
  binStart: number;
  binMs: number;
  filter: TimelineFilter;
  timeZone: string;
}): unknown[] {
  return documentQueryKey({ documentId, segments: [DocumentResource.Timeline, EDITS_SEGMENT, binStart, binMs, filter, timeZone] });
}

export function versionQueryKey({ documentId, sequence }: { documentId: string; sequence: number | null }): unknown[] {
  return documentQueryKey({ documentId, segments: [DocumentResource.Versions, sequence] });
}

export function selectionSummaryQueryKey({
  documentId,
  selection,
  timeZone,
}: {
  documentId: string;
  selection: EditSelection;
  timeZone: string;
}): unknown[] {
  return [...summariesQueryKey(documentId), SELECTION_SEGMENT, selection, timeZone];
}

function withQuery({ path, params }: { path: string; params: URLSearchParams }): string {
  const query = params.toString();
  if (!query) return path;
  return `${path}?${query}`;
}

function filterParams({ filter, timeZone }: { filter: TimelineFilter; timeZone: string }): URLSearchParams {
  const params = new URLSearchParams();
  params.set(TimelineQueryParam.TimeZone, timeZone);
  if (filter.term) params.set(TimelineQueryParam.Term, filter.term);
  if (filter.author) params.set(TimelineQueryParam.Author, filter.author);
  return params;
}

function selectionParams({
  selection,
  binMs,
  timeZone,
}: {
  selection: EditSelection;
  binMs: number | null;
  timeZone: string;
}): URLSearchParams {
  const params = filterParams({ filter: selection, timeZone });
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

function readRetryAfterMs(response: Response): number {
  const retryAfterMs = Number(response.headers.get(RETRY_AFTER_HEADER)) * SECOND_MS;
  if (!Number.isFinite(retryAfterMs)) return MIN_RETRY_AFTER_MS;
  return Math.max(MIN_RETRY_AFTER_MS, retryAfterMs);
}

export async function fetchTimeline({
  documentId,
  filter,
  timeZone,
}: {
  documentId: string;
  filter: TimelineFilter;
  timeZone: string;
}): Promise<DocumentTimeline> {
  const path = documentApiPath({ documentId, resource: DocumentResource.Timeline });
  const response = await apiGet(withQuery({ path, params: filterParams({ filter, timeZone }) }));
  assertDocumentAvailable(response);
  return readJson<DocumentTimeline>({ response, subject: 'Timeline request' });
}

export async function fetchSummaries(documentId: string): Promise<TopicSummaries> {
  const response = await apiGet(documentApiPath({ documentId, resource: DocumentResource.Summaries }));
  assertDocumentAvailable(response);
  return readJson<TopicSummaries>({ response, subject: 'Summaries request' });
}

export async function refreshTopics(documentId: string): Promise<TopicStatus> {
  const response = await apiSend({ path: topicsRefreshApiPath(documentId), method: HttpMethod.Post, body: null });
  assertDocumentAvailable(response);
  if (response.status === HttpStatus.TooManyRequests) throw new TopicsRefreshTooSoonError(readRetryAfterMs(response));
  return readJson<TopicStatus>({ response, subject: TOPICS_REFRESH_SUBJECT });
}

export async function fetchSelectionSummary({
  documentId,
  selection,
  binMs,
  timeZone,
}: {
  documentId: string;
  selection: EditSelection;
  binMs: number | null;
  timeZone: string;
}): Promise<SelectionSummaryView> {
  const response = await apiGet(
    withQuery({ path: selectionSummaryApiPath(documentId), params: selectionParams({ selection, binMs, timeZone }) }),
  );
  assertDocumentAvailable(response);
  return readJson<SelectionSummaryView>({ response, subject: 'Selection summary request' });
}

export async function requestSelectionSummary({
  documentId,
  selection,
  binMs,
  timeZone,
}: {
  documentId: string;
  selection: EditSelection;
  binMs: number | null;
  timeZone: string;
}): Promise<SummarizeResponse> {
  const response = await apiSend({
    path: withQuery({ path: selectionSummaryApiPath(documentId), params: selectionParams({ selection, binMs, timeZone }) }),
    method: HttpMethod.Post,
    body: null,
  });
  assertDocumentAvailable(response);
  if (response.status === HttpStatus.TooManyRequests) throw new SummaryTooSoonError(readRetryAfterMs(response));
  if (response.status === HttpStatus.ServiceUnavailable) throw new ApiRequestError(await unavailableMessage(response));
  return readJson<SummarizeResponse>({ response, subject: SUMMARIZE_EDITS_SUBJECT });
}

export async function fetchBinEdits({
  documentId,
  binStart,
  binMs,
  filter,
  timeZone,
}: {
  documentId: string;
  binStart: number;
  binMs: number;
  filter: TimelineFilter;
  timeZone: string;
}): Promise<BinEdits> {
  const params = filterParams({ filter, timeZone });
  params.set(TimelineQueryParam.BinStart, String(binStart));
  params.set(TimelineQueryParam.BinMs, String(binMs));
  const response = await apiGet(withQuery({ path: timelineEditsApiPath(documentId), params }));
  assertDocumentAvailable(response);
  return readJson<BinEdits>({ response, subject: 'Bin edits request' });
}

export async function fetchVersion({ documentId, sequence }: { documentId: string; sequence: number }): Promise<VersionLoad> {
  const response = await apiGet(versionApiPath({ documentId, sequence }));
  assertDocumentAvailable(response);
  if (response.status === HttpStatus.Accepted) return { kind: VersionLoadKind.Pending, retryAfterMs: readRetryAfterMs(response) };
  if (!response.ok) return { kind: VersionLoadKind.Failed };
  return { kind: VersionLoadKind.Ready, version: await response.json() };
}
