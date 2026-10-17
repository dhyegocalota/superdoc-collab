import {
  documentApiPath,
  documentPagePath,
  DocumentResource,
  DocumentRole,
  HISTORY_CATCHING_UP_MESSAGE,
  HttpMethod,
  HttpStatus,
  NO_MATCHING_EDITS_MESSAGE,
  SECOND_MS,
  timelineEditsApiPath,
  TOPICS_PENDING_MESSAGE,
  TOPICS_REFRESH_TOO_SOON_MESSAGE,
  TOPICS_UNAVAILABLE_MESSAGE,
  topicsRefreshApiPath,
  TimelineBandKind,
  TopicState,
  type BinEdits,
  type DocumentTimeline,
} from '@superdoc-history/types';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { DOCUMENT_ID } from '@/test/opened-document';
import { renderWithProviders } from '@/test/render-with-providers';
import { timelineWith } from '@/test/timeline-fixtures';
import { TIMELINE_POLL_MS } from './timeline-api';
import { NO_EDITS_IN_BIN_MESSAGE, NO_EDITS_YET_MESSAGE, REFRESH_TOPICS_LABEL, RESIZE_PANEL_LABEL, RETRY_TOPICS_LABEL } from './timeline-copy';
import { TimelinePanel } from './timeline-panel';
import { SNIPPET_MAX_CHARACTERS } from './bin-edits';
import { PROJECTION_LAG_NOTICE_MS } from './timeline-notices';
import { MIN_EDITOR_WIDTH, MIN_PANEL_WIDTH, PANEL_RESIZE_STEP } from './use-panel-width';
import { TIMELINE_TOGGLE_LABEL } from '@/features/editor/editor-copy';

const TIMELINE_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Timeline });
const SUMMARIES_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Summaries });
const EDITS_PATH = timelineEditsApiPath(DOCUMENT_ID);
const ROUTE = documentPagePath(DOCUMENT_ID);
const FAILURE_TEXT = 'The model refused';
const LAG_MS = 12_000;
const SMALL_LAG_MS = 2000;
const DRAGGED_WIDTH = 500;
const SHRUNK_WINDOW_WIDTH = 800;
const REFRESH_STATUS = { state: TopicState.Pending, failure: null, computedAtSequence: null };
const baseTimeline = timelineWith({ volumes: [[10], [20]], names: ['Budget'] });

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function json(body: unknown, status = HttpStatus.Ok): Response {
  return new Response(JSON.stringify(body), { status });
}

function mockTimelineApi({ timeline = baseTimeline, edits, refreshStatus = HttpStatus.Accepted, refreshHeaders }: { timeline?: DocumentTimeline; edits?: BinEdits; refreshStatus?: HttpStatus; refreshHeaders?: Record<string, string> } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input).split('?')[0];
    if (path === TIMELINE_PATH) return json(timeline);
    if (path === SUMMARIES_PATH) return json({ summaries: [] });
    if (path === EDITS_PATH) return json(edits);
    if (path === topicsRefreshApiPath(DOCUMENT_ID) && init?.method === HttpMethod.Post) return new Response(JSON.stringify(REFRESH_STATUS), { status: refreshStatus, headers: refreshHeaders });
    throw new Error(`unexpected request ${String(input)}`);
  });
}

function timelineRequests(fetchSpy: ReturnType<typeof mockTimelineApi>): number {
  return fetchSpy.mock.calls.filter(([input]) => String(input).split('?')[0] === TIMELINE_PATH).length;
}

function renderPanel({ role = DocumentRole.Editor, route = ROUTE }: { role?: DocumentRole; route?: string } = {}) {
  return renderWithProviders(<TimelinePanel documentId={DOCUMENT_ID} role={role} onTravel={vi.fn()} onBackToLive={vi.fn()} />, { route });
}

const failedTimeline: DocumentTimeline = { ...baseTimeline, topics: { state: TopicState.Failed, failure: FAILURE_TEXT, computedAtSequence: null } };

test('failed topics explain why and let an editor retry', async () => {
  mockTimelineApi({ timeline: failedTimeline });
  renderPanel();
  expect(await screen.findByText(TOPICS_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  expect(screen.getByText(FAILURE_TEXT)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: RETRY_TOPICS_LABEL })).toBeInTheDocument();
});

test('a reader sees the failure but cannot retry or refresh', async () => {
  mockTimelineApi({ timeline: failedTimeline });
  renderPanel({ role: DocumentRole.Reader });
  expect(await screen.findByText(TOPICS_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: RETRY_TOPICS_LABEL })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: REFRESH_TOPICS_LABEL })).not.toBeInTheDocument();
});

test('Retry posts the refresh once and loads the timeline again', async () => {
  const fetchSpy = mockTimelineApi({ timeline: failedTimeline });
  renderPanel();
  await userEvent.click(await screen.findByRole('button', { name: RETRY_TOPICS_LABEL }));
  await waitFor(() => expect(timelineRequests(fetchSpy)).toBe(2));
  const refreshCalls = fetchSpy.mock.calls.filter(([input]) => input === topicsRefreshApiPath(DOCUMENT_ID));
  expect(refreshCalls).toHaveLength(1);
});

test('pending topics without topic bands say the topics are being named', async () => {
  const pending: DocumentTimeline = { ...timelineWith({ volumes: [[10]], names: ['Ana'], kinds: [TimelineBandKind.Author] }), topics: { state: TopicState.Pending, failure: null, computedAtSequence: null } };
  mockTimelineApi({ timeline: pending });
  renderPanel();
  expect(await screen.findByText(TOPICS_PENDING_MESSAGE)).toBeInTheDocument();
});

test('a lagging projection is announced only from the threshold', async () => {
  mockTimelineApi({ timeline: { ...baseTimeline, projection: { isBehind: true, lagMs: LAG_MS, isDegraded: false } } });
  renderPanel();
  expect(await screen.findByText(HISTORY_CATCHING_UP_MESSAGE)).toBeInTheDocument();
  expect(screen.getByText('12 s behind')).toBeInTheDocument();
});

test('a small lag shows nothing', async () => {
  expect(SMALL_LAG_MS).toBeLessThan(PROJECTION_LAG_NOTICE_MS);
  mockTimelineApi({ timeline: { ...baseTimeline, projection: { isBehind: true, lagMs: SMALL_LAG_MS, isDegraded: false } } });
  renderPanel();
  expect(await screen.findByLabelText('Budget, 30 characters')).toBeInTheDocument();
  expect(screen.queryByText(HISTORY_CATCHING_UP_MESSAGE)).not.toBeInTheDocument();
});

test('a filter that matches nothing says so', async () => {
  mockTimelineApi({ timeline: timelineWith({ volumes: [[0], [0]], names: ['Budget'] }) });
  renderPanel({ route: `${ROUTE}?term=zzz` });
  expect(await screen.findByText(NO_MATCHING_EDITS_MESSAGE)).toBeInTheDocument();
});

test('a document without edits says so', async () => {
  mockTimelineApi({ timeline: timelineWith({ volumes: [], names: [] }) });
  renderPanel();
  expect(await screen.findByText(NO_EDITS_YET_MESSAGE)).toBeInTheDocument();
});

test('a selected bin lists its runs with cut snippets', async () => {
  const edits: BinEdits = {
    binStart: baseTimeline.bins[1]!.start,
    binMs: baseTimeline.binMs,
    runs: [{ blockId: 'block-1', bandId: baseTimeline.bands[0]!.id, authorKeys: ['ana'], inserted: 'hello', deleted: 'x'.repeat(SNIPPET_MAX_CHARACTERS + 80), lastServerTime: 1 }],
    authors: { ana: { id: '1', name: 'Ana' } },
  };
  mockTimelineApi({ edits });
  renderPanel({ route: `${ROUTE}?at=${baseTimeline.bins[1]!.start}` });
  expect(await screen.findByText('+"hello"')).toBeInTheDocument();
  expect(screen.getByText(`−"${'x'.repeat(SNIPPET_MAX_CHARACTERS)}…"`)).toBeInTheDocument();
  expect(screen.getByText('Ana')).toBeInTheDocument();
});

test('a selected bin without runs says so', async () => {
  mockTimelineApi({ edits: { binStart: baseTimeline.bins[1]!.start, binMs: baseTimeline.binMs, runs: [], authors: {} } });
  renderPanel({ route: `${ROUTE}?at=${baseTimeline.bins[1]!.start}` });
  expect(await screen.findByText(NO_EDITS_IN_BIN_MESSAGE)).toBeInTheDocument();
});

test('collapsing the panel stops the polling', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const fetchSpy = mockTimelineApi();
  renderPanel();
  await waitFor(() => expect(timelineRequests(fetchSpy)).toBe(1));
  fireEvent.click(screen.getByRole('button', { name: TIMELINE_TOGGLE_LABEL }));
  const before = timelineRequests(fetchSpy);
  await vi.advanceTimersByTimeAsync(TIMELINE_POLL_MS * 3);
  expect(timelineRequests(fetchSpy)).toBe(before);
});

test('the separator resizes with the arrow keys and never below the minimum', async () => {
  mockTimelineApi();
  renderPanel();
  const separator = await screen.findByRole('separator', { name: RESIZE_PANEL_LABEL });
  expect(separator).toHaveAttribute('aria-valuenow', String(MIN_PANEL_WIDTH));
  fireEvent.keyDown(separator, { key: 'ArrowLeft' });
  expect(separator).toHaveAttribute('aria-valuenow', String(MIN_PANEL_WIDTH + PANEL_RESIZE_STEP));
  fireEvent.keyDown(separator, { key: 'ArrowRight' });
  fireEvent.keyDown(separator, { key: 'ArrowRight' });
  expect(separator).toHaveAttribute('aria-valuenow', String(MIN_PANEL_WIDTH));
});

test('a refresh that is too soon explains why', async () => {
  mockTimelineApi({ refreshStatus: HttpStatus.TooManyRequests });
  renderPanel();
  await userEvent.click(await screen.findByRole('button', { name: REFRESH_TOPICS_LABEL }));
  expect(await screen.findByRole('alert')).toHaveTextContent(TOPICS_REFRESH_TOO_SOON_MESSAGE);
});

test('dragging the separator resizes within the limits', async () => {
  mockTimelineApi();
  renderPanel();
  const separator = await screen.findByRole('separator', { name: RESIZE_PANEL_LABEL });
  separator.setPointerCapture = vi.fn();
  fireEvent.pointerDown(separator, { pointerId: 1 });
  fireEvent.pointerMove(separator, { buttons: 1, clientX: window.innerWidth - DRAGGED_WIDTH });
  expect(separator).toHaveAttribute('aria-valuenow', String(DRAGGED_WIDTH));
  fireEvent.pointerMove(separator, { buttons: 1, clientX: 0 });
  expect(separator).toHaveAttribute('aria-valuenow', String(window.innerWidth - MIN_EDITOR_WIDTH));
  fireEvent.pointerMove(separator, { buttons: 1, clientX: window.innerWidth });
  expect(separator).toHaveAttribute('aria-valuenow', String(MIN_PANEL_WIDTH));
  fireEvent.pointerMove(separator, { buttons: 0, clientX: window.innerWidth - DRAGGED_WIDTH });
  expect(separator).toHaveAttribute('aria-valuenow', String(MIN_PANEL_WIDTH));
});

test('shrinking the window re-clamps the panel and its maximum', async () => {
  mockTimelineApi();
  renderPanel();
  const separator = await screen.findByRole('separator', { name: RESIZE_PANEL_LABEL });
  fireEvent.pointerMove(separator, { buttons: 1, clientX: 0 });
  const originalWidth = window.innerWidth;
  window.innerWidth = SHRUNK_WINDOW_WIDTH;
  fireEvent(window, new Event('resize'));
  window.innerWidth = originalWidth;
  expect(separator).toHaveAttribute('aria-valuemax', String(SHRUNK_WINDOW_WIDTH - MIN_EDITOR_WIDTH));
  expect(separator).toHaveAttribute('aria-valuenow', String(SHRUNK_WINDOW_WIDTH - MIN_EDITOR_WIDTH));
});

test('the too-soon notice goes away when the cooldown ends', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockTimelineApi({ refreshStatus: HttpStatus.TooManyRequests, refreshHeaders: { 'Retry-After': '5' } });
  renderPanel();
  fireEvent.click(await screen.findByRole('button', { name: REFRESH_TOPICS_LABEL }));
  expect(await screen.findByRole('alert')).toHaveTextContent(TOPICS_REFRESH_TOO_SOON_MESSAGE);
  await vi.advanceTimersByTimeAsync(4 * SECOND_MS);
  expect(screen.getByRole('alert')).toBeInTheDocument();
  await vi.advanceTimersByTimeAsync(2 * SECOND_MS);
  expect(screen.queryByRole('alert')).toBeNull();
});
