import {
  ClientActor,
  UTC_TIME_ZONE,
  AppRoute,
  documentApiPath,
  documentPagePath,
  DocumentResource,
  DocumentRole,
  HISTORY_CATCHING_UP_MESSAGE,
  HttpMethod,
  HttpStatus,
  NO_MATCHING_EDITS_MESSAGE,
  RETRY_AFTER_HEADER,
  SECOND_MS,
  SELECTION_SUMMARY_FAILED_MESSAGE,
  SELECTION_SUMMARY_TOO_SOON_MESSAGE,
  selectionSummaryApiPath,
  SelectionSummaryState,
  SummarizeStep,
  TimelineBandKind,
  timelineEditsApiPath,
  TOPICS_PENDING_MESSAGE,
  TOPICS_REFRESH_TOO_SOON_MESSAGE,
  TOPICS_UNAVAILABLE_MESSAGE,
  topicsRefreshApiPath,
  TopicState,
  type BinEdits,
  type DocumentTimeline,
  type SelectionSummaryView,
} from '@superdoc-collab/types';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, onTestFinished, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import { FIXTURE_AUTHOR_NAME, FIXTURE_SUMMARY_AUTHOR, timelineWith } from '@/testing/timeline-fixtures';
import { TIMELINE_POLL_MS } from './timeline-api';
import { timesInLabel } from '@/features/settings/settings-copy';
import {
  EARLIER_STATE_LABEL,
  FILTER_LABEL,
  NO_EDITS_IN_BIN_MESSAGE,
  NO_EDITS_TO_SUMMARIZE_MESSAGE,
  NO_EDITS_YET_MESSAGE,
  NOTHING_TO_GROUP_MESSAGE,
  REGROUP_TOPICS_LABEL,
  RESIZE_PANEL_LABEL,
  RETRY_SUMMARY_LABEL,
  RETRY_TOPICS_LABEL,
  retryInLabel,
  SELECTION_SUMMARY_HEADING,
  SUMMARIES_UNAVAILABLE_MESSAGE,
  SUMMARIZE_EDITS_LABEL,
  SUMMARIZING_EDITS_MESSAGE,
  SUMMARY_UP_TO_DATE_MESSAGE,
  TOP_EDITS_LABEL,
} from './timeline-copy';
import { PanelState, TimelinePanel } from './timeline-panel';
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
const SELECTION_PATH = selectionSummaryApiPath(DOCUMENT_ID);
const NONE_VIEW: SelectionSummaryView = {
  state: SelectionSummaryState.None,
  summary: null,
  failure: null,
  isModelAvailable: true,
  step: SummarizeStep.Idle,
};
const RUNNING_VIEW: SelectionSummaryView = { ...NONE_VIEW, state: SelectionSummaryState.Running };
const READY_VIEW: SelectionSummaryView = {
  state: SelectionSummaryState.Ready,
  summary: { key: 'k', sentence: 'Ana raised the budget.', authors: [FIXTURE_SUMMARY_AUTHOR], computedAtSequence: 3, isStale: false },
  failure: null,
  isModelAvailable: true,
  step: SummarizeStep.Idle,
};
const STALE_VIEW: SelectionSummaryView = { ...READY_VIEW, summary: { ...READY_VIEW.summary!, isStale: true } };
const FAILED_VIEW: SelectionSummaryView = {
  state: SelectionSummaryState.Failed,
  summary: null,
  failure: SELECTION_SUMMARY_FAILED_MESSAGE,
  isModelAvailable: true,
  step: SummarizeStep.Idle,
};
const UNAVAILABLE_VIEW: SelectionSummaryView = {
  state: SelectionSummaryState.Failed,
  summary: null,
  failure: 'The language model is unavailable: LLM_MODEL is not set on the server.',
  isModelAvailable: false,
  step: SummarizeStep.Idle,
};
const baseTimeline = timelineWith({ volumes: [[10], [20]], names: ['Budget'] });

const scrollIntoView = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
  scrollIntoView.mockClear();
});

vi.mock('@/lib/use-time-zone', () => ({ useTimeZone: () => ({ timeZone: 'UTC', source: 'account' }) }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function json(body: unknown, status = HttpStatus.Ok): Response {
  return jsonResponse({ body, status });
}

function mockTimelineApi({
  timeline = baseTimeline,
  edits,
  refreshStatus = HttpStatus.Accepted,
  refreshHeaders,
  selectionViews = [NONE_VIEW],
  timelines = [timeline],
  summarizeResponse = () => json(RUNNING_VIEW, HttpStatus.Accepted),
}: {
  timeline?: DocumentTimeline;
  edits?: BinEdits;
  refreshStatus?: HttpStatus;
  refreshHeaders?: Record<string, string>;
  selectionViews?: SelectionSummaryView[];
  timelines?: DocumentTimeline[];
  summarizeResponse?: () => Response | Promise<Response>;
} = {}) {
  const remainingViews = [...selectionViews];
  const remainingTimelines = [...timelines];
  function nextTimeline(): DocumentTimeline {
    if (remainingTimelines.length > 1) return remainingTimelines.shift()!;
    return remainingTimelines[0]!;
  }
  function nextView(): SelectionSummaryView {
    if (remainingViews.length > 1) return remainingViews.shift()!;
    return remainingViews[0]!;
  }
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input).split('?')[0];
    if (path === TIMELINE_PATH) return json(nextTimeline());
    if (path === SUMMARIES_PATH) return json({ summaries: [] });
    if (path === EDITS_PATH) return json(edits);
    if (path === SELECTION_PATH && init?.method === HttpMethod.Post) return summarizeResponse();
    if (path === SELECTION_PATH) return json(nextView());
    if (path === topicsRefreshApiPath(DOCUMENT_ID) && init?.method === HttpMethod.Post)
      return jsonResponse({ body: REFRESH_STATUS, status: refreshStatus, headers: refreshHeaders });
    throw new Error(`unexpected request ${String(input)}`);
  });
}

function timelineRequests(fetchSpy: ReturnType<typeof mockTimelineApi>): number {
  return fetchSpy.mock.calls.filter(([input]) => String(input).split('?')[0] === TIMELINE_PATH).length;
}

function renderPanel({ role = DocumentRole.Editor, route = ROUTE }: { role?: DocumentRole; route?: string } = {}) {
  return renderWithProviders(<TimelinePanel documentId={DOCUMENT_ID} role={role} onTravel={vi.fn()} onBackToLive={vi.fn()} />, { route });
}

const failedTimeline: DocumentTimeline = {
  ...baseTimeline,
  topics: { state: TopicState.Failed, failure: FAILURE_TEXT, computedAtSequence: null },
};

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
  expect(screen.queryByRole('button', { name: REGROUP_TOPICS_LABEL })).not.toBeInTheDocument();
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
  const pending: DocumentTimeline = {
    ...timelineWith({ volumes: [[10]], names: ['Ana'], kinds: [TimelineBandKind.Author] }),
    topics: { state: TopicState.Pending, failure: null, computedAtSequence: null },
  };
  mockTimelineApi({ timeline: pending });
  renderPanel();
  expect(await screen.findByText(TOPICS_PENDING_MESSAGE)).toBeInTheDocument();
});

test('pending topics with topic bands still say the topics are being named', async () => {
  const pending: DocumentTimeline = {
    ...timelineWith({ volumes: [[10]], names: ['Budget'] }),
    topics: { state: TopicState.Pending, failure: null, computedAtSequence: 1 },
  };
  mockTimelineApi({ timeline: pending });
  renderPanel();
  expect(await screen.findByText(TOPICS_PENDING_MESSAGE)).toBeInTheDocument();
});

test('a lagging projection is announced only from the threshold', async () => {
  mockTimelineApi({ timeline: { ...baseTimeline, projection: { ...baseTimeline.projection, isBehind: true, lagMs: LAG_MS } } });
  renderPanel();
  expect(await screen.findByText(HISTORY_CATCHING_UP_MESSAGE)).toBeInTheDocument();
  expect(screen.getByText('12 s behind')).toBeInTheDocument();
});

test('a small lag shows nothing', async () => {
  expect(SMALL_LAG_MS).toBeLessThan(PROJECTION_LAG_NOTICE_MS);
  mockTimelineApi({ timeline: { ...baseTimeline, projection: { ...baseTimeline.projection, isBehind: true, lagMs: SMALL_LAG_MS } } });
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
    runs: [
      {
        blockId: 'block-1',
        bandId: baseTimeline.bands[0]!.id,
        authorKeys: ['ana'],
        inserted: 'hello',
        deleted: 'x'.repeat(SNIPPET_MAX_CHARACTERS + 80),
        lastServerTime: 1,
      },
    ],
    authors: { ana: { id: '1', name: 'Ana', actor: ClientActor.Human } },
  };
  mockTimelineApi({ edits });
  renderPanel({ route: `${ROUTE}?at=${baseTimeline.bins[1]!.start}` });
  expect(await screen.findByText('hello')).toBeInTheDocument();
  expect(screen.getByText(`${'x'.repeat(SNIPPET_MAX_CHARACTERS)}…`)).toBeInTheDocument();
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
  await userEvent.click(await screen.findByRole('button', { name: REGROUP_TOPICS_LABEL }));
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
  fireEvent.click(await screen.findByRole('button', { name: REGROUP_TOPICS_LABEL }));
  expect(await screen.findByRole('alert')).toHaveTextContent(TOPICS_REFRESH_TOO_SOON_MESSAGE);
  await vi.advanceTimersByTimeAsync(4 * SECOND_MS);
  expect(screen.getByRole('alert')).toBeInTheDocument();
  await vi.advanceTimersByTimeAsync(2 * SECOND_MS);
  expect(screen.queryByRole('alert')).toBeNull();
});

function postCalls(fetchSpy: ReturnType<typeof mockTimelineApi>): string[] {
  return fetchSpy.mock.calls
    .filter(([input, init]) => String(input).split('?')[0] === SELECTION_PATH && init?.method === HttpMethod.Post)
    .map(([input]) => String(input));
}

test('an editor summarizes the filtered selection, waits on a disabled button and sees who edited', async () => {
  let release: (response: Response) => void = () => undefined;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const fetchSpy = mockTimelineApi({ selectionViews: [NONE_VIEW, READY_VIEW], summarizeResponse: () => pending });
  renderPanel({ route: `${ROUTE}?author=ana` });
  await userEvent.click(await screen.findByRole('button', { name: SUMMARIZE_EDITS_LABEL }));
  expect(fetchSpy).toHaveBeenCalledWith(`${SELECTION_PATH}?timeZone=UTC&author=ana`, expect.objectContaining({ method: HttpMethod.Post }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: SUMMARIZE_EDITS_LABEL })).toHaveAttribute('title', SUMMARIZING_EDITS_MESSAGE),
  );
  expect(screen.getByRole('button', { name: SUMMARIZE_EDITS_LABEL })).toBeDisabled();
  release(json(READY_VIEW, HttpStatus.Accepted));
  const card = await screen.findByRole('region', { name: SELECTION_SUMMARY_HEADING });
  await waitFor(() => expect(card).toHaveTextContent(READY_VIEW.summary!.sentence));
  expect(within(card).getByTitle(FIXTURE_AUTHOR_NAME)).toBeInTheDocument();
  expect(postCalls(fetchSpy)).toHaveLength(1);
});

test('a reader reads the summary but has no Summarize button', async () => {
  mockTimelineApi({ selectionViews: [READY_VIEW] });
  renderPanel({ role: DocumentRole.Reader });
  expect(await screen.findByRole('region', { name: SELECTION_SUMMARY_HEADING })).toHaveTextContent(READY_VIEW.summary!.sentence);
  expect(screen.queryByRole('button', { name: SUMMARIZE_EDITS_LABEL })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: RETRY_SUMMARY_LABEL })).not.toBeInTheDocument();
});

test('Summarize is disabled with a reason when nothing matches', async () => {
  mockTimelineApi({ timeline: timelineWith({ volumes: [[0], [0]], names: ['Budget'] }) });
  renderPanel();
  const button = await screen.findByRole('button', { name: SUMMARIZE_EDITS_LABEL });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('title', NO_EDITS_TO_SUMMARIZE_MESSAGE);
  expect(screen.getByText(NO_EDITS_TO_SUMMARIZE_MESSAGE)).toBeVisible();
  expect(button).toHaveAccessibleDescription(NO_EDITS_TO_SUMMARIZE_MESSAGE);
});

test('a selected bin with no edits disables Summarize', async () => {
  const timeline = timelineWith({ volumes: [[10], [0]], names: ['Budget'] });
  mockTimelineApi({ timeline, edits: { binStart: timeline.bins[1]!.start, binMs: timeline.binMs, runs: [], authors: {} } });
  renderPanel({ route: `${ROUTE}?at=${timeline.bins[1]!.start}` });
  expect(await screen.findByText(NO_EDITS_IN_BIN_MESSAGE)).toBeInTheDocument();
  const button = screen.getByRole('button', { name: SUMMARIZE_EDITS_LABEL });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('title', NO_EDITS_TO_SUMMARIZE_MESSAGE);
  expect(screen.queryByRole('region', { name: SELECTION_SUMMARY_HEADING })).not.toBeInTheDocument();
});

test('an at outside every bin summarizes the whole selection', async () => {
  const fetchSpy = mockTimelineApi();
  renderPanel({ route: `${ROUTE}?at=1` });
  const button = await screen.findByRole('button', { name: SUMMARIZE_EDITS_LABEL });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  await waitFor(() => expect(postCalls(fetchSpy)).toEqual([`${SELECTION_PATH}?timeZone=UTC`]));
});

test('clicking a bin without a version mark summarizes that bin', async () => {
  const fetchSpy = mockTimelineApi();
  renderPanel();
  const band = await screen.findByLabelText('Budget, 30 characters');
  fireEvent.keyDown(band, { key: 'ArrowRight' });
  fireEvent.keyDown(band, { key: 'ArrowRight' });
  await userEvent.click(screen.getByRole('button', { name: SUMMARIZE_EDITS_LABEL }));
  await waitFor(() =>
    expect(postCalls(fetchSpy)).toEqual([`${SELECTION_PATH}?timeZone=UTC&at=${baseTimeline.bins[1]!.start}&binMs=${baseTimeline.binMs}`]),
  );
  expect(window.location.search).not.toContain('at=');
});

test('an up-to-date summary disables Summarize and a stale one shows the badge and enables it', async () => {
  mockTimelineApi({ selectionViews: [READY_VIEW] });
  renderPanel();
  await screen.findByRole('region', { name: SELECTION_SUMMARY_HEADING });
  expect(screen.getByRole('button', { name: SUMMARIZE_EDITS_LABEL })).toBeDisabled();
  expect(screen.getByRole('button', { name: SUMMARIZE_EDITS_LABEL })).toHaveAttribute('title', SUMMARY_UP_TO_DATE_MESSAGE);
  expect(screen.getByText(SUMMARY_UP_TO_DATE_MESSAGE)).toBeVisible();
  cleanup();
  vi.restoreAllMocks();
  mockTimelineApi({ selectionViews: [STALE_VIEW] });
  renderPanel();
  expect(await screen.findByText(EARLIER_STATE_LABEL)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: SUMMARIZE_EDITS_LABEL })).toBeEnabled();
});

test('a request too soon shows the seconds from Retry-After', async () => {
  const tooSoon = () =>
    jsonResponse({
      body: { error: SELECTION_SUMMARY_TOO_SOON_MESSAGE },
      status: HttpStatus.TooManyRequests,
      headers: { [RETRY_AFTER_HEADER]: '12' },
    });
  mockTimelineApi({ summarizeResponse: tooSoon });
  renderPanel();
  await userEvent.click(await screen.findByRole('button', { name: SUMMARIZE_EDITS_LABEL }));
  expect(await screen.findByRole('alert')).toHaveTextContent(`${SELECTION_SUMMARY_TOO_SOON_MESSAGE} ${retryInLabel(12)}`);
});

test('the cooldown message belongs to the selection that caused it', async () => {
  const tooSoon = () =>
    jsonResponse({
      body: { error: SELECTION_SUMMARY_TOO_SOON_MESSAGE },
      status: HttpStatus.TooManyRequests,
      headers: { [RETRY_AFTER_HEADER]: '12' },
    });
  mockTimelineApi({ summarizeResponse: tooSoon });
  renderPanel({ route: `${ROUTE}?author=ana` });
  await userEvent.click(await screen.findByRole('button', { name: SUMMARIZE_EDITS_LABEL }));
  expect(await screen.findByText(new RegExp(retryInLabel(12)))).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText(FILTER_LABEL), '@bruno{Enter}');
  await waitFor(() => expect(screen.queryByText(new RegExp(retryInLabel(12)))).toBeNull());
});

test('a failed summary offers a retry to editors only', async () => {
  const fetchSpy = mockTimelineApi({ selectionViews: [FAILED_VIEW] });
  renderPanel();
  expect(await screen.findByText(SELECTION_SUMMARY_FAILED_MESSAGE)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: RETRY_SUMMARY_LABEL }));
  await waitFor(() => expect(postCalls(fetchSpy)).toHaveLength(1));
  cleanup();
  renderPanel({ role: DocumentRole.Reader });
  expect(await screen.findByText(SELECTION_SUMMARY_FAILED_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: RETRY_SUMMARY_LABEL })).not.toBeInTheDocument();
});

test('without a language model Summarize is disabled and the card stays quiet', async () => {
  mockTimelineApi({ selectionViews: [UNAVAILABLE_VIEW] });
  renderPanel();
  const button = await screen.findByRole('button', { name: SUMMARIZE_EDITS_LABEL });
  await waitFor(() => expect(button).toHaveAttribute('title', SUMMARIES_UNAVAILABLE_MESSAGE));
  expect(button).toBeDisabled();
  expect(screen.getByText(SUMMARIES_UNAVAILABLE_MESSAGE)).toBeVisible();
  expect(screen.queryByRole('region', { name: SELECTION_SUMMARY_HEADING })).not.toBeInTheDocument();
});

test('the summary cooldown message goes away when the cooldown ends', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const tooSoon = () =>
    jsonResponse({
      body: { error: SELECTION_SUMMARY_TOO_SOON_MESSAGE },
      status: HttpStatus.TooManyRequests,
      headers: { [RETRY_AFTER_HEADER]: '5' },
    });
  mockTimelineApi({ summarizeResponse: tooSoon });
  renderPanel();
  fireEvent.click(await screen.findByRole('button', { name: SUMMARIZE_EDITS_LABEL }));
  expect(await screen.findByRole('alert')).toHaveTextContent(retryInLabel(5));
  await vi.advanceTimersByTimeAsync(4 * SECOND_MS);
  expect(screen.getByRole('alert')).toBeInTheDocument();
  await vi.advanceTimersByTimeAsync(2 * SECOND_MS);
  expect(screen.queryByRole('alert')).toBeNull();
});

test('Retry is disabled while its request is pending', async () => {
  const pending = new Promise<Response>(() => undefined);
  const fetchSpy = mockTimelineApi({ selectionViews: [FAILED_VIEW], summarizeResponse: () => pending });
  renderPanel();
  const retry = await screen.findByRole('button', { name: RETRY_SUMMARY_LABEL });
  await userEvent.click(retry);
  await waitFor(() => expect(retry).toBeDisabled());
  await userEvent.click(retry);
  expect(postCalls(fetchSpy)).toHaveLength(1);
});

test('the summary card sits in a polite live region that exists before it has content', async () => {
  mockTimelineApi();
  renderPanel();
  await screen.findByRole('button', { name: SUMMARIZE_EDITS_LABEL });
  expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  expect(screen.queryByRole('region', { name: SELECTION_SUMMARY_HEADING })).not.toBeInTheDocument();
});

test('two authors with the same name each get an avatar', async () => {
  const twins: SelectionSummaryView = {
    ...READY_VIEW,
    summary: { ...READY_VIEW.summary!, authors: [FIXTURE_SUMMARY_AUTHOR, FIXTURE_SUMMARY_AUTHOR] },
  };
  mockTimelineApi({ selectionViews: [twins] });
  renderPanel();
  const card = await screen.findByRole('region', { name: SELECTION_SUMMARY_HEADING });
  expect(within(card).getAllByTitle(FIXTURE_AUTHOR_NAME)).toHaveLength(2);
});

function selectionReads(fetchSpy: ReturnType<typeof mockTimelineApi>): number {
  return fetchSpy.mock.calls.filter(([input, init]) => String(input).split('?')[0] === SELECTION_PATH && init?.method !== HttpMethod.Post)
    .length;
}

test('a timeline that advances reads the summary once and shows it for an earlier state', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const grownTimeline: DocumentTimeline = {
    ...timelineWith({ volumes: [[10], [25]], names: ['Budget'] }),
    projection: { ...baseTimeline.projection, cursor: 2 },
  };
  const fetchSpy = mockTimelineApi({ timelines: [baseTimeline, grownTimeline], selectionViews: [READY_VIEW, STALE_VIEW] });
  renderPanel();
  expect(await screen.findByText(READY_VIEW.summary!.sentence)).toBeInTheDocument();
  expect(selectionReads(fetchSpy)).toBe(1);
  await vi.advanceTimersByTimeAsync(TIMELINE_POLL_MS);
  expect(await screen.findByText(EARLIER_STATE_LABEL)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: SUMMARIZE_EDITS_LABEL })).toBeEnabled();
  await vi.advanceTimersByTimeAsync(TIMELINE_POLL_MS * 3);
  expect(selectionReads(fetchSpy)).toBe(2);
});

test('every topic compute reads the summary again even when the volume is the same', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const pending: DocumentTimeline = { ...baseTimeline, topics: { state: TopicState.Pending, failure: null, computedAtSequence: null } };
  const recomputed: DocumentTimeline = { ...baseTimeline, topics: { state: TopicState.Ready, failure: null, computedAtSequence: 9 } };
  const fetchSpy = mockTimelineApi({
    timelines: [baseTimeline, pending, recomputed],
    selectionViews: [READY_VIEW, READY_VIEW, STALE_VIEW],
  });
  renderPanel();
  expect(await screen.findByText(READY_VIEW.summary!.sentence)).toBeInTheDocument();
  expect(selectionReads(fetchSpy)).toBe(1);
  await vi.advanceTimersByTimeAsync(TIMELINE_POLL_MS);
  await waitFor(() => expect(selectionReads(fetchSpy)).toBe(2));
  await vi.advanceTimersByTimeAsync(TIMELINE_POLL_MS);
  await waitFor(() => expect(selectionReads(fetchSpy)).toBe(3));
  expect(await screen.findByText(EARLIER_STATE_LABEL)).toBeInTheDocument();
  expect(screen.getByText(READY_VIEW.summary!.sentence)).toBeInTheDocument();
});

test('refreshing the topics reads the summary again', async () => {
  const fetchSpy = mockTimelineApi({ selectionViews: [READY_VIEW] });
  renderPanel();
  await screen.findByText(READY_VIEW.summary!.sentence);
  const before = selectionReads(fetchSpy);
  await userEvent.click(screen.getByRole('button', { name: REGROUP_TOPICS_LABEL }));
  await waitFor(() => expect(selectionReads(fetchSpy)).toBe(before + 1));
});

test('collapsing the panel drops its width and the resize handle', async () => {
  mockTimelineApi();
  renderPanel();
  expect(await screen.findByRole('separator', { name: RESIZE_PANEL_LABEL })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: TIMELINE_TOGGLE_LABEL }));
  expect(screen.queryByRole('separator', { name: RESIZE_PANEL_LABEL })).not.toBeInTheDocument();
  expect(screen.getByRole('complementary')).toHaveAttribute('data-state', PanelState.Collapsed);
});

test('the summary card sits under the filter, before the top edits, and scrolls into view when it starts', async () => {
  mockTimelineApi({ selectionViews: [NONE_VIEW, RUNNING_VIEW] });
  renderPanel();
  await userEvent.click(await screen.findByRole('button', { name: SUMMARIZE_EDITS_LABEL }));
  const card = await screen.findByRole('region', { name: SELECTION_SUMMARY_HEADING });
  expect(within(card).getByText(SUMMARIZING_EDITS_MESSAGE)).toBeInTheDocument();
  const topEdits = screen.getByRole('heading', { name: TOP_EDITS_LABEL });
  expect(screen.getByLabelText(FILTER_LABEL).compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(card.compareDocumentPosition(topEdits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
});

test('a summary already cached when the panel opens does not scroll the page', async () => {
  mockTimelineApi({ selectionViews: [READY_VIEW] });
  renderPanel();
  expect(await screen.findByText(READY_VIEW.summary!.sentence)).toBeInTheDocument();
  expect(scrollIntoView).not.toHaveBeenCalled();
});

test('an empty document says only that there are no edits and explains the disabled Regroup topics', async () => {
  const emptyPending: DocumentTimeline = {
    ...timelineWith({ volumes: [], names: [] }),
    topics: { state: TopicState.Pending, failure: null, computedAtSequence: null },
  };
  mockTimelineApi({ timeline: emptyPending });
  renderPanel();
  expect(await screen.findByText(NO_EDITS_YET_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByText(TOPICS_PENDING_MESSAGE)).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: TOP_EDITS_LABEL })).not.toBeInTheDocument();
  const regroup = screen.getByRole('button', { name: REGROUP_TOPICS_LABEL });
  expect(regroup).toBeDisabled();
  expect(regroup).toHaveAccessibleDescription(NOTHING_TO_GROUP_MESSAGE);
  expect(screen.getByText(NOTHING_TO_GROUP_MESSAGE)).toBeVisible();
});

test('bin edits mark insertions and deletions without quotes or padding', async () => {
  const edits: BinEdits = {
    binStart: baseTimeline.bins[1]!.start,
    binMs: baseTimeline.binMs,
    runs: [
      {
        blockId: 'block-1',
        bandId: baseTimeline.bands[0]!.id,
        authorKeys: ['ana'],
        inserted: ' More money',
        deleted: 'old ',
        lastServerTime: 1,
      },
    ],
    authors: { ana: { id: '1', name: 'Ana', actor: ClientActor.Human } },
  };
  mockTimelineApi({ edits });
  renderPanel({ route: `${ROUTE}?at=${baseTimeline.bins[1]!.start}` });
  expect((await screen.findByText('More money')).tagName).toBe('INS');
  expect(screen.getByText('old').tagName).toBe('DEL');
});

const CONNECTED_WIDTH = 600;
const DETACHED_WIDTH = 0;
const resizeObservers = new Set<DetachingResizeObserver>();

class DetachingResizeObserver {
  private readonly targets: Element[] = [];

  constructor(private readonly callback: ResizeObserverCallback) {
    resizeObservers.add(this);
  }

  observe(target: Element): void {
    this.targets.push(target);
    this.report();
  }

  unobserve(): void {}

  disconnect(): void {
    resizeObservers.delete(this);
  }

  report(): void {
    const entries = this.targets.map(
      (target) => ({ target, contentRect: { width: target.isConnected ? CONNECTED_WIDTH : DETACHED_WIDTH } }) as ResizeObserverEntry,
    );
    this.callback(entries, this as unknown as ResizeObserver);
  }
}

function reportSizes(): void {
  act(() => resizeObservers.forEach((observer) => observer.report()));
}

test('reopening the panel brings the chart back', async () => {
  const sharedResizeObserver = globalThis.ResizeObserver;
  vi.stubGlobal('ResizeObserver', DetachingResizeObserver);
  onTestFinished(() => {
    vi.stubGlobal('ResizeObserver', sharedResizeObserver);
  });
  mockTimelineApi();
  renderPanel();
  expect(await screen.findByLabelText(/^Budget/)).toBeInTheDocument();
  const toggle = screen.getByRole('button', { name: TIMELINE_TOGGLE_LABEL });
  await userEvent.click(toggle);
  reportSizes();
  await userEvent.click(toggle);
  reportSizes();
  expect(await screen.findByLabelText(/^Budget/)).toBeInTheDocument();
});

test('the header names the zone times are shown in and links to settings', async () => {
  mockTimelineApi({ timeline: baseTimeline });
  renderPanel();
  expect(await screen.findByRole('link', { name: new RegExp(`^${timesInLabel(UTC_TIME_ZONE)}`) })).toHaveAttribute(
    'href',
    AppRoute.Settings,
  );
});
