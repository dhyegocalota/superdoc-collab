import {
  AppRoute,
  ClientActor,
  UTC_TIME_ZONE,
  documentApiPath,
  documentPagePath,
  DocumentResource,
  DocumentRole,
  HISTORY_CATCHING_UP_MESSAGE,
  HttpMethod,
  HttpStatus,
  NO_MATCHING_EDITS_MESSAGE,
  SELECTION_SUMMARY_FAILED_MESSAGE,
  selectionSummaryApiPath,
  SelectionSummaryState,
  SummarizeStep,
  TimelineBandKind,
  timelineEditsApiPath,
  TOPICS_PENDING_MESSAGE,
  TOPICS_UNAVAILABLE_MESSAGE,
  TopicState,
  type BinEdits,
  type DocumentTimeline,
  type SelectionSummaryView,
} from '@superdoc-collab/types';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, expect, onTestFinished, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { NARROW_VIEWPORT_WIDTH, stubViewportWidth, WIDE_VIEWPORT_WIDTH } from '@/testing/viewport';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import { FIXTURE_AUTHOR_NAME, FIXTURE_SUMMARY_AUTHOR, timelineWith } from '@/testing/timeline-fixtures';
import { TIMELINE_POLL_MS } from './timeline-api';
import { timesInLabel } from '@/features/settings/settings-copy';
import {
  EARLIER_STATE_LABEL,
  CLEAR_SELECTION_LABEL,
  FILTER_LABEL,
  LOADING_TIMELINE_LABEL,
  NO_EDITS_IN_BIN_MESSAGE,
  NO_EDITS_YET_MESSAGE,
  RESIZE_PANEL_LABEL,
  RETRY_SUMMARY_LABEL,
  RETRY_TOPICS_LABEL,
  SELECTION_SUMMARY_HEADING,
  SHOWING_WHOLE_DOCUMENT_MESSAGE,
  SUMMARIZE_EDITS_LABEL,
  SUMMARIZING_EDITS_MESSAGE,
  PANEL_POSITION_LABEL,
  PANEL_POSITION_LABELS,
  TIMELINE_HEADING,
  TOP_EDITS_LABEL,
  VIEW_VERSION_LABEL,
} from './timeline-copy';
import { CHART_HEIGHT } from './streamgraph-layout';
import { PanelColumn, PanelState, TimelinePanel } from './timeline-panel';
import { SNIPPET_MAX_CHARACTERS } from './bin-edits';
import { PROJECTION_LAG_NOTICE_MS } from './timeline-notices';
import type { SummarizeControl } from './use-summarize';
import { PANEL_POSITION_STORAGE_KEY, PanelPosition } from './use-panel-position';
import { MIN_EDITOR_HEIGHT, MIN_EDITOR_WIDTH, MIN_PANEL_HEIGHT, MIN_PANEL_WIDTH, PANEL_RESIZE_STEP } from './use-panel-width';
import { TIMELINE_TOGGLE_LABEL } from '@/features/editor/editor-copy';

const TIMELINE_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Timeline });
const SUMMARIES_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Summaries });
const EDITS_PATH = timelineEditsApiPath(DOCUMENT_ID);
const ROUTE = documentPagePath(DOCUMENT_ID);
const REGROUP_TOPICS_LABEL = 'Regroup topics';
const FAILURE_TEXT = 'The model refused';
const LAG_MS = 12_000;
const SMALL_LAG_MS = 2000;
const DRAGGED_WIDTH = 500;
const SHRUNK_WINDOW_WIDTH = 800;
const AREA_HEIGHT = 1000;
const DEFAULT_HEIGHT = 580;
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

const VERSION_SEQUENCE = 10;

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
  selectionViews = [NONE_VIEW],
  timelines = [timeline],
}: {
  timeline?: DocumentTimeline;
  edits?: BinEdits;
  selectionViews?: SelectionSummaryView[];
  timelines?: DocumentTimeline[];
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
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = String(input).split('?')[0];
    if (path === TIMELINE_PATH) return json(nextTimeline());
    if (path === SUMMARIES_PATH) return json({ summaries: [] });
    if (path === EDITS_PATH) return json(edits);
    if (path === SELECTION_PATH) return json(nextView());
    throw new Error(`unexpected request ${String(input)}`);
  });
}

function timelineRequests(fetchSpy: ReturnType<typeof mockTimelineApi>): number {
  return fetchSpy.mock.calls.filter(([input]) => String(input).split('?')[0] === TIMELINE_PATH).length;
}

function idleSummarize(overrides: Partial<SummarizeControl> = {}): SummarizeControl {
  return {
    summarize: vi.fn(),
    isRunning: false,
    outcome: null,
    error: null,
    retryAfterSeconds: null,
    showSelection: vi.fn(),
    ...overrides,
  };
}

type PanelOptions = {
  role?: DocumentRole;
  route?: string;
  position?: PanelPosition;
  isOpen?: boolean;
  summarize?: SummarizeControl;
  onOpenChange?: (isOpen: boolean) => void;
  onTravel?: (binStart: number) => void;
  isLoadingVersion?: boolean;
};

function PanelHarness({
  role,
  position,
  initiallyOpen,
  summarize,
  onOpenChange,
  onTravel,
  isLoadingVersion,
}: Required<Omit<PanelOptions, 'route' | 'isOpen'>> & { initiallyOpen: boolean }) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);

  function handleOpenChange(next: boolean): void {
    onOpenChange(next);
    setIsOpen(next);
  }

  return (
    <TimelinePanel
      documentId={DOCUMENT_ID}
      role={role}
      position={position}
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      summarize={summarize}
      pendingVersion={null}
      isLoadingVersion={isLoadingVersion}
      onTravel={onTravel}
      onConfirmTravel={vi.fn()}
      onBackToLive={vi.fn()}
    />
  );
}

function renderPanel({
  role = DocumentRole.Editor,
  route = ROUTE,
  position = PanelPosition.Side,
  isOpen = true,
  summarize = idleSummarize(),
  onOpenChange = vi.fn(),
  onTravel = vi.fn(),
  isLoadingVersion = false,
}: PanelOptions = {}) {
  return renderWithProviders(
    <PanelHarness
      role={role}
      position={position}
      initiallyOpen={isOpen}
      summarize={summarize}
      onOpenChange={onOpenChange}
      onTravel={onTravel}
      isLoadingVersion={isLoadingVersion}
    />,
    { route },
  );
}

const failedTimeline: DocumentTimeline = {
  ...baseTimeline,
  topics: { state: TopicState.Failed, failure: FAILURE_TEXT, computedAtSequence: null },
};

test('the heading reads Edits and the header has no Regroup topics button', async () => {
  mockTimelineApi();
  renderPanel();
  expect(await screen.findByRole('heading', { name: TIMELINE_HEADING, level: 2 })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: REGROUP_TOPICS_LABEL })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: SUMMARIZE_EDITS_LABEL })).not.toBeInTheDocument();
});

test('the Timeline toggle is gone and the collapse button is named Edits panel', async () => {
  mockTimelineApi();
  renderPanel();
  const collapse = await screen.findByRole('button', { name: TIMELINE_TOGGLE_LABEL });
  expect(collapse).toHaveAttribute('aria-expanded', 'true');
  expect(screen.queryByRole('button', { name: 'Timeline' })).not.toBeInTheDocument();
});

test('the collapse button calls onOpenChange and summarize reaches the card', async () => {
  const onOpenChange = vi.fn();
  const summarize = idleSummarize({ error: new Error('The model refused.') });
  mockTimelineApi({ selectionViews: [NONE_VIEW] });
  renderPanel({ onOpenChange, summarize });
  expect(await screen.findByRole('alert')).toHaveTextContent('The model refused.');
  await userEvent.click(screen.getByRole('button', { name: RETRY_SUMMARY_LABEL }));
  expect(summarize.summarize).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: TIMELINE_TOGGLE_LABEL }));
  expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  expect(screen.getByRole('complementary')).toHaveAttribute('data-state', PanelState.Collapsed);
});

test('the side panel keeps one column and no position toggle below the large breakpoint', async () => {
  mockTimelineApi();
  renderPanel({ position: PanelPosition.Side });
  await screen.findByLabelText(/^Budget/);
  expect(screen.getByRole('complementary')).toHaveAttribute('data-position', PanelPosition.Side);
  expect(document.querySelector(`[data-column="${PanelColumn.Chart}"]`)).toBeNull();
  expect(screen.queryByRole('radiogroup', { name: PANEL_POSITION_LABEL })).not.toBeInTheDocument();
});

test('the bottom panel has a chart column with the filter and a list column with the summary and Top edits', async () => {
  mockTimelineApi({ selectionViews: [READY_VIEW] });
  renderPanel({ position: PanelPosition.Bottom });
  const chartColumn = (await screen.findByLabelText(/^Budget/)).closest(`[data-column="${PanelColumn.Chart}"]`)!;
  expect(chartColumn).not.toBeNull();
  expect(within(chartColumn as HTMLElement).getByLabelText(FILTER_LABEL)).toBeInTheDocument();
  const listColumn = (await screen.findByRole('region', { name: SELECTION_SUMMARY_HEADING })).closest(
    `[data-column="${PanelColumn.List}"]`,
  )!;
  expect(listColumn).not.toBeNull();
  expect(within(listColumn as HTMLElement).getByRole('heading', { name: TOP_EDITS_LABEL })).toBeInTheDocument();
  expect(within(listColumn as HTMLElement).queryByLabelText(FILTER_LABEL)).not.toBeInTheDocument();
  expect(screen.getByRole('complementary')).toHaveAttribute('data-position', PanelPosition.Bottom);
});

test('the bottom panel has a row resize handle on its top edge that grows with the arrow keys', async () => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ height: AREA_HEIGHT } as DOMRect);
  mockTimelineApi();
  renderPanel({ position: PanelPosition.Bottom });
  const separator = await screen.findByRole('separator', { name: RESIZE_PANEL_LABEL });
  expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
  expect(separator).toHaveAttribute('aria-valuenow', String(DEFAULT_HEIGHT));
  expect(separator).toHaveAttribute('aria-valuemin', String(MIN_PANEL_HEIGHT));
  expect(separator).toHaveAttribute('aria-valuemax', String(AREA_HEIGHT - MIN_EDITOR_HEIGHT));
  fireEvent.keyDown(separator, { key: 'ArrowUp' });
  expect(separator).toHaveAttribute('aria-valuenow', String(DEFAULT_HEIGHT + PANEL_RESIZE_STEP));
  expect(screen.getByRole('complementary')).toHaveStyle({ height: `${DEFAULT_HEIGHT + PANEL_RESIZE_STEP}px` });
  fireEvent.keyDown(separator, { key: 'ArrowDown' });
  fireEvent.keyDown(separator, { key: 'ArrowDown' });
  expect(separator).toHaveAttribute('aria-valuenow', String(DEFAULT_HEIGHT - PANEL_RESIZE_STEP));
});

test('collapsed at the bottom the panel is a bar with the largest topic chips, and a chip click filters and opens it', async () => {
  const onOpenChange = vi.fn();
  mockTimelineApi();
  const { router } = renderPanel({ position: PanelPosition.Bottom, isOpen: false, onOpenChange });
  await userEvent.click(await screen.findByRole('button', { name: 'Budget' }));
  expect(router.state.location.search).toBe(`?topic=${baseTimeline.bands[0]!.id}`);
  expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
  expect(screen.getByRole('complementary')).toHaveAttribute('data-state', PanelState.Open);
  expect(screen.queryByRole('separator')).toBeInTheDocument();
});

test('from the large breakpoint the header shows the position toggle and choosing stores the position', async () => {
  const sharedMatchMedia = window.matchMedia;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  onTestFinished(() => {
    vi.stubGlobal('matchMedia', sharedMatchMedia);
    localStorage.clear();
  });
  mockTimelineApi();
  renderPanel({ position: PanelPosition.Bottom });
  const toggle = await screen.findByRole('radiogroup', { name: PANEL_POSITION_LABEL });
  await userEvent.click(within(toggle).getByRole('radio', { name: PANEL_POSITION_LABELS[PanelPosition.Side] }));
  expect(localStorage.getItem(PANEL_POSITION_STORAGE_KEY)).toBe(PanelPosition.Side);
});

test('collapsed at the side the panel keeps its rail with no chips', async () => {
  mockTimelineApi();
  renderPanel({ position: PanelPosition.Side, isOpen: false });
  expect(await screen.findByRole('button', { name: TIMELINE_TOGGLE_LABEL })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', { name: 'Budget' })).not.toBeInTheDocument();
  expect(screen.queryByRole('separator')).not.toBeInTheDocument();
});

test('failed topics explain why and let an editor retry', async () => {
  mockTimelineApi({ timeline: failedTimeline });
  renderPanel();
  expect(await screen.findByText(TOPICS_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  expect(screen.getByText(FAILURE_TEXT)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: RETRY_TOPICS_LABEL })).toBeInTheDocument();
});

test('a reader sees the failure but cannot retry', async () => {
  mockTimelineApi({ timeline: failedTimeline });
  renderPanel({ role: DocumentRole.Reader });
  expect(await screen.findByText(TOPICS_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: RETRY_TOPICS_LABEL })).not.toBeInTheDocument();
});

test('Retry runs the single Summarize job', async () => {
  const summarize = idleSummarize();
  mockTimelineApi({ timeline: failedTimeline });
  renderPanel({ summarize });
  await userEvent.click(await screen.findByRole('button', { name: RETRY_TOPICS_LABEL }));
  expect(summarize.summarize).toHaveBeenCalledTimes(1);
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

test('a reader reads the summary but has no Retry summary button', async () => {
  mockTimelineApi({ selectionViews: [READY_VIEW] });
  renderPanel({ role: DocumentRole.Reader, summarize: idleSummarize({ error: new Error('The model refused.') }) });
  expect(await screen.findByRole('region', { name: SELECTION_SUMMARY_HEADING })).toHaveTextContent(READY_VIEW.summary!.sentence);
  expect(screen.queryByRole('button', { name: RETRY_SUMMARY_LABEL })).not.toBeInTheDocument();
});

test('a failed summary offers a retry to editors only', async () => {
  const summarize = idleSummarize();
  mockTimelineApi({ selectionViews: [FAILED_VIEW] });
  renderPanel({ summarize });
  expect(await screen.findByText(SELECTION_SUMMARY_FAILED_MESSAGE)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: RETRY_SUMMARY_LABEL }));
  expect(summarize.summarize).toHaveBeenCalledTimes(1);
  cleanup();
  renderPanel({ role: DocumentRole.Reader });
  expect(await screen.findByText(SELECTION_SUMMARY_FAILED_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: RETRY_SUMMARY_LABEL })).not.toBeInTheDocument();
});

test('without a language model the card stays quiet', async () => {
  mockTimelineApi({ selectionViews: [UNAVAILABLE_VIEW] });
  renderPanel();
  await screen.findByLabelText(/^Budget/);
  expect(screen.queryByRole('region', { name: SELECTION_SUMMARY_HEADING })).not.toBeInTheDocument();
});

test('a stale summary shows the earlier-state badge', async () => {
  mockTimelineApi({ selectionViews: [STALE_VIEW] });
  renderPanel();
  expect(await screen.findByText(EARLIER_STATE_LABEL)).toBeInTheDocument();
});

test('the summary card sits in a polite live region that exists before it has content', async () => {
  mockTimelineApi();
  renderPanel();
  await screen.findByLabelText(/^Budget/);
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

test('collapsing the panel drops its width and the resize handle', async () => {
  mockTimelineApi();
  renderPanel();
  expect(await screen.findByRole('separator', { name: RESIZE_PANEL_LABEL })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: TIMELINE_TOGGLE_LABEL }));
  expect(screen.queryByRole('separator', { name: RESIZE_PANEL_LABEL })).not.toBeInTheDocument();
  expect(screen.getByRole('complementary')).toHaveAttribute('data-state', PanelState.Collapsed);
});

test('the summary card sits under the filter and before the top edits', async () => {
  mockTimelineApi({ selectionViews: [RUNNING_VIEW] });
  renderPanel();
  const card = await screen.findByRole('region', { name: SELECTION_SUMMARY_HEADING });
  expect(within(card).getByText(SUMMARIZING_EDITS_MESSAGE)).toBeInTheDocument();
  const topEdits = screen.getByRole('heading', { name: TOP_EDITS_LABEL });
  expect(screen.getByLabelText(FILTER_LABEL).compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(card.compareDocumentPosition(topEdits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('a summary already cached when the panel opens does not scroll the page', async () => {
  mockTimelineApi({ selectionViews: [READY_VIEW] });
  renderPanel();
  expect(await screen.findByText(READY_VIEW.summary!.sentence)).toBeInTheDocument();
  expect(scrollIntoView).not.toHaveBeenCalled();
});

test('an empty document says only that there are no edits', async () => {
  const emptyPending: DocumentTimeline = {
    ...timelineWith({ volumes: [], names: [] }),
    topics: { state: TopicState.Pending, failure: null, computedAtSequence: null },
  };
  mockTimelineApi({ timeline: emptyPending });
  renderPanel();
  expect(await screen.findByText(NO_EDITS_YET_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByText(TOPICS_PENDING_MESSAGE)).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: TOP_EDITS_LABEL })).not.toBeInTheDocument();
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

test('the panel tells the summarize control which selection it shows, including a bin without a version', async () => {
  const summarize = idleSummarize();
  mockTimelineApi();
  renderPanel({ summarize });
  const band = await screen.findByLabelText('Budget, 30 characters');
  fireEvent.keyDown(band, { key: 'ArrowRight' });
  fireEvent.keyDown(band, { key: 'ArrowRight' });
  await waitFor(() =>
    expect(summarize.showSelection).toHaveBeenLastCalledWith({ term: null, author: null, topic: null, at: baseTimeline.bins[1]!.start }),
  );
});

test('while the timeline is loading the panel reports no selection, so the URL selection stands', async () => {
  const summarize = idleSummarize();
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));
  renderPanel({ summarize, route: `${ROUTE}?at=${baseTimeline.bins[1]!.start}` });
  await screen.findByRole('heading', { name: TIMELINE_HEADING, level: 2 });
  expect(summarize.showSelection).not.toHaveBeenCalled();
});

test('the bottom panel puts the chart first in a block that keeps its height, and the notices over the card', async () => {
  mockTimelineApi({ timeline: failedTimeline, selectionViews: [READY_VIEW] });
  renderPanel({ position: PanelPosition.Bottom });
  const chart = await screen.findByLabelText(/^Budget/);
  const chartColumn = chart.closest(`[data-column="${PanelColumn.Chart}"]`) as HTMLElement;
  const listColumn = (await screen.findByRole('region', { name: SELECTION_SUMMARY_HEADING })).closest(
    `[data-column="${PanelColumn.List}"]`,
  ) as HTMLElement;
  expect(chartColumn.firstElementChild).toHaveClass('shrink-0', 'overflow-visible');
  expect(chartColumn.firstElementChild).toContainElement(chart);
  expect(chart.compareDocumentPosition(screen.getByLabelText(FILTER_LABEL)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(listColumn).getByText(TOPICS_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  expect(within(chartColumn).queryByText(TOPICS_UNAVAILABLE_MESSAGE)).not.toBeInTheDocument();
});

test('below md the bottom columns take their content height so the chart never overlaps the card', async () => {
  mockTimelineApi();
  renderPanel({ position: PanelPosition.Bottom });
  await screen.findByLabelText(/^Budget/);
  document.querySelectorAll('[data-column]').forEach((column) => {
    const classes = column.className.split(' ');
    expect(classes).not.toContain('min-h-0');
    expect(classes).toContain('md:min-h-0');
  });
});

function wholeDocumentHeader(): HTMLElement {
  return screen.getByText(SHOWING_WHOLE_DOCUMENT_MESSAGE).closest<HTMLElement>('[aria-live]')!;
}

function isFollowing({ before, after }: { before: Element; after: Element }): boolean {
  return Boolean(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING);
}

test('below md the order is chart, header, filter, card, edits and the header is sticky', async () => {
  mockTimelineApi({ selectionViews: [READY_VIEW] });
  renderPanel({ position: PanelPosition.Bottom });
  const chart = await screen.findByLabelText(/^Budget/);
  const header = wholeDocumentHeader();
  const filter = screen.getByLabelText(FILTER_LABEL);
  const card = await screen.findByRole('region', { name: SELECTION_SUMMARY_HEADING });
  const edits = screen.getByRole('heading', { name: TOP_EDITS_LABEL });
  expect(isFollowing({ before: chart, after: header })).toBe(true);
  expect(isFollowing({ before: header, after: filter })).toBe(true);
  expect(isFollowing({ before: filter, after: card })).toBe(true);
  expect(isFollowing({ before: card, after: edits })).toBe(true);
  expect(header).toHaveClass('sticky', 'top-0');
});

test('the header lives under the chart in the chart column and its scroller is the panel body', async () => {
  mockTimelineApi();
  renderPanel({ position: PanelPosition.Bottom });
  await screen.findByLabelText(/^Budget/);
  const chartColumn = document.querySelector<HTMLElement>(`[data-column="${PanelColumn.Chart}"]`)!;
  expect(chartColumn).toContainElement(wholeDocumentHeader());
  expect(chartColumn).toHaveClass('contents', 'md:flex');
});

test('from the large breakpoint there is no header', async () => {
  const sharedMatchMedia = window.matchMedia;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  onTestFinished(() => {
    vi.stubGlobal('matchMedia', sharedMatchMedia);
  });
  mockTimelineApi();
  renderPanel({ position: PanelPosition.Bottom });
  await screen.findByLabelText(/^Budget/);
  expect(screen.queryByText(SHOWING_WHOLE_DOCUMENT_MESSAGE)).not.toBeInTheDocument();
});

test('selecting a bin puts its range and edit count in the header and Clear selection empties it', async () => {
  mockTimelineApi();
  renderPanel({ position: PanelPosition.Bottom });
  fireEvent.keyDown(await screen.findByLabelText(/^Budget/), { key: 'ArrowRight' });
  const header = (await screen.findByText('10 edits')).closest<HTMLElement>('[aria-live]')!;
  expect(within(header).getByText(/Oct 16/)).toBeInTheDocument();
  await userEvent.click(within(header).getByRole('button', { name: CLEAR_SELECTION_LABEL }));
  expect(await screen.findByText(SHOWING_WHOLE_DOCUMENT_MESSAGE)).toBeInTheDocument();
});

test('a tap on the chart scrolls the header into view', async () => {
  mockTimelineApi();
  renderPanel({ position: PanelPosition.Bottom });
  const chart = (await screen.findByLabelText(/^Budget/)).closest('svg')!;
  const header = wholeDocumentHeader();
  fireEvent.pointerDown(chart, { clientX: 0 });
  await waitFor(() => {
    const revealedHeader = scrollIntoView.mock.contexts.includes(header);
    expect(revealedHeader).toBe(true);
  });
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
});

test('the first load shows a status skeleton with the chart height', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));
  renderPanel({ position: PanelPosition.Bottom });
  const skeleton = await screen.findByRole('status', { name: LOADING_TIMELINE_LABEL });
  expect(skeleton).toHaveStyle({ height: `${CHART_HEIGHT}px` });
  expect(skeleton).toHaveClass('animate-pulse', 'motion-reduce:animate-none');
});

test('once the timeline is loaded the skeleton is gone', async () => {
  mockTimelineApi();
  renderPanel({ position: PanelPosition.Bottom });
  await screen.findByLabelText(/^Budget/);
  expect(screen.queryByRole('status', { name: LOADING_TIMELINE_LABEL })).not.toBeInTheDocument();
});

const versionedTimeline: DocumentTimeline = {
  ...baseTimeline,
  bins: baseTimeline.bins.map((bin, index) => ({ ...bin, versionSequence: VERSION_SEQUENCE + index })),
};

test('below lg selecting a versioned bin by key never travels and View version does', async () => {
  const onTravel = vi.fn();
  mockTimelineApi({ timeline: versionedTimeline });
  renderPanel({ position: PanelPosition.Bottom, onTravel });
  fireEvent.keyDown(await screen.findByLabelText(/^Budget/), { key: 'ArrowRight' });
  const viewVersion = await screen.findByRole('button', { name: VIEW_VERSION_LABEL });
  expect(onTravel).not.toHaveBeenCalled();
  await userEvent.click(viewVersion);
  expect(onTravel).toHaveBeenCalledExactlyOnceWith(versionedTimeline.bins[0]!.start);
});

test('the bin already shown offers no View version', async () => {
  mockTimelineApi({ timeline: versionedTimeline });
  renderPanel({ position: PanelPosition.Bottom, route: `${ROUTE}?at=${versionedTimeline.bins[0]!.start}` });
  await screen.findByText('10 edits');
  expect(screen.queryByRole('button', { name: VIEW_VERSION_LABEL })).not.toBeInTheDocument();
});

test('a bin without a version offers no View version', async () => {
  mockTimelineApi();
  renderPanel({ position: PanelPosition.Bottom });
  fireEvent.keyDown(await screen.findByLabelText(/^Budget/), { key: 'ArrowRight' });
  await screen.findByText('10 edits');
  expect(screen.queryByRole('button', { name: VIEW_VERSION_LABEL })).not.toBeInTheDocument();
});

test('View version is disabled while a version loads', async () => {
  mockTimelineApi({ timeline: versionedTimeline });
  renderPanel({ position: PanelPosition.Bottom, isLoadingVersion: true });
  fireEvent.keyDown(await screen.findByLabelText(/^Budget/), { key: 'ArrowRight' });
  expect(await screen.findByRole('button', { name: VIEW_VERSION_LABEL })).toBeDisabled();
});

test('from lg selecting a versioned bin travels at once and there is no header', async () => {
  stubViewportWidth(WIDE_VIEWPORT_WIDTH);
  const onTravel = vi.fn();
  mockTimelineApi({ timeline: versionedTimeline });
  renderPanel({ position: PanelPosition.Bottom, onTravel });
  fireEvent.keyDown(await screen.findByLabelText(/^Budget/), { key: 'ArrowRight' });
  expect(onTravel).toHaveBeenCalledExactlyOnceWith(versionedTimeline.bins[0]!.start);
  expect(screen.queryByRole('button', { name: VIEW_VERSION_LABEL })).not.toBeInTheDocument();
});

test('below md the header sits in a contents wrapper whose parent is the scrolling body', async () => {
  mockTimelineApi();
  renderPanel({ position: PanelPosition.Bottom });
  await screen.findByLabelText(/^Budget/);
  expect(wholeDocumentHeader().parentElement).toHaveClass('contents');
  expect(wholeDocumentHeader().parentElement!.parentElement).toHaveClass('grid', 'overflow-y-auto');
});

test('from md to lg the header tops the list column', async () => {
  stubViewportWidth(NARROW_VIEWPORT_WIDTH);
  mockTimelineApi();
  renderPanel({ position: PanelPosition.Bottom });
  await screen.findByLabelText(/^Budget/);
  const listColumn = document.querySelector<HTMLElement>(`[data-column="${PanelColumn.List}"]`)!;
  expect(wholeDocumentHeader().parentElement).toBe(listColumn);
  expect(listColumn.firstElementChild).toBe(wholeDocumentHeader());
});
