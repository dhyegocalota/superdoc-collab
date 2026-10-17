import {
  ApiPath,
  DOCUMENT_UNAVAILABLE_MESSAGE,
  documentApiPath,
  documentPagePath,
  DocumentResource,
  DocumentRole,
  HttpStatus,
  RoomMode,
  selectionSummaryApiPath,
  SelectionSummaryState,
  timelineEditsApiPath,
  VERSION_FAILED_MESSAGE,
  versionApiPath,
  versionCollaborationPath,
  versionViewPagePath,
  type BinEdits,
  type DocumentTimeline,
  type EditRunView,
  type OpenedDocument,
  type SelectionSummaryView,
  type VersionSummary,
} from '@superdoc-history/types';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ViewerMessageKind } from '@/features/editor/viewer-messages';
import { formatTimestamp } from '@/features/timeline/timeline-tooltip';
import { SCRUB_DEBOUNCE_MS } from '@/features/timeline/use-time-travel';
import { BACK_TO_LIVE_LABEL, FILTER_LABEL, LOADING_VERSION_MESSAGE, STREAMGRAPH_TITLE, VERSION_FRAME_TITLE } from '@/features/timeline/timeline-copy';
import { DOCUMENT_ID, openedAs, SESSION_USER } from '@/test/opened-document';
import { renderWithProviders } from '@/test/render-with-providers';
import { timelineWith } from '@/test/timeline-fixtures';
import { MEMBERS_REFRESH_MS } from './editor-api';
import { TIMELINE_POLL_MS } from '@/features/timeline/timeline-api';
import { BLANK_DOCX_PATH } from './editor-api';
import { DocumentPage } from './document-page';

type VersionReply = { status: HttpStatus; body?: VersionSummary; headers?: Record<string, string> };

const { SuperDoc, superDocDestroy } = vi.hoisted(() => {
  const superDocDestroy = vi.fn();
  return { superDocDestroy, SuperDoc: vi.fn(function SuperDocStub() { return { destroy: superDocDestroy, export: vi.fn() }; }) };
});

vi.mock('superdoc', () => ({ SuperDoc }));
vi.mock('superdoc/style.css', () => ({}));

const NONE_VIEW: SelectionSummaryView = { state: SelectionSummaryState.None, summary: null, failure: null, isModelAvailable: true };
const SEQUENCES = [41, 42, 50, 51, 52];
const PAGE_ROUTE = documentPagePath(DOCUMENT_ID);
const SERVER_TIME = Date.UTC(2026, 9, 16, 14, 2);
const EVIL_ORIGIN = 'http://evil.example';
const SLOW_WAIT = { timeout: 3000 };
const RUNS: EditRunView[] = [{ blockId: 'block-1', bandId: 'band-0', authorKeys: ['ana'], inserted: 'hello', deleted: '', lastServerTime: 1 }];
const baseTimeline = timelineWith({ volumes: SEQUENCES.map(() => [10]), names: ['Budget'] });
const versionedTimeline: DocumentTimeline = { ...baseTimeline, bins: baseTimeline.bins.map((bin, index) => ({ ...bin, versionSequence: SEQUENCES[index]! })) };
const BIN_STARTS = versionedTimeline.bins.map((bin) => bin.start);

function versionOf(sequence: number): VersionSummary {
  return { sequence, serverTime: SERVER_TIME, collaborationPath: versionCollaborationPath({ documentId: DOCUMENT_ID, sequence }) };
}

function readyReply(sequence: number): VersionReply {
  return { status: HttpStatus.Ok, body: versionOf(sequence) };
}

function reply({ status, body, headers }: VersionReply): Response {
  if (body) return new Response(JSON.stringify(body), { status });
  return new Response(null, { status, headers });
}

function mockDocumentApi({
  opened = openedAs(DocumentRole.Editor, RoomMode.Join),
  openedStatus = HttpStatus.Ok,
  versions = {},
  edits = { binStart: 0, binMs: 0, runs: [], authors: {} },
  timelines = [versionedTimeline],
  holdTimeline = false,
  timelineGate = Promise.resolve(),
  isGone = () => false,
}: { opened?: OpenedDocument; openedStatus?: HttpStatus; versions?: Record<number, VersionReply[]>; edits?: BinEdits; timelines?: DocumentTimeline[]; holdTimeline?: boolean; timelineGate?: Promise<void>; isGone?: () => boolean } = {}) {
  const timelineQueue = [...timelines];
  const queues = new Map(Object.entries(versions).map(([sequence, replies]) => [versionApiPath({ documentId: DOCUMENT_ID, sequence: Number(sequence) }), [...replies]]));
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = String(input).split('?')[0]!;
    if (isGone() && path !== ApiPath.Me && path !== BLANK_DOCX_PATH) return new Response(null, { status: HttpStatus.NotFound });
    if (path === ApiPath.Me) return new Response(JSON.stringify({ user: SESSION_USER }));
    if (path === documentApiPath({ documentId: DOCUMENT_ID })) return new Response(JSON.stringify(opened), { status: openedStatus });
    if (path === documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Members })) return new Response(JSON.stringify({ members: [] }));
    if (path === documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Timeline })) {
      if (holdTimeline) return new Promise<Response>(() => undefined);
      await timelineGate;
      return new Response(JSON.stringify(timelineQueue.length > 1 ? timelineQueue.shift() : timelineQueue[0]));
    }
    if (path === documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Summaries })) return new Response(JSON.stringify({ summaries: [] }));
    if (path === selectionSummaryApiPath(DOCUMENT_ID)) return new Response(JSON.stringify(NONE_VIEW));
    if (path === timelineEditsApiPath(DOCUMENT_ID)) return new Response(JSON.stringify(edits));
    if (path === BLANK_DOCX_PATH) return new Response(new Uint8Array([1, 2, 3]));
    const queue = queues.get(path);
    if (!queue) throw new Error(`unexpected request ${path}`);
    return reply(queue.length > 1 ? queue.shift()! : queue[0]!);
  });
}

function versionRequests(fetchSpy: ReturnType<typeof mockDocumentApi>): string[] {
  return fetchSpy.mock.calls.map(([path]) => String(path)).filter((path) => path.includes(`/${DocumentResource.Versions}/`));
}

function frameFor(sequence: number): HTMLIFrameElement {
  const frame = screen.getAllByTitle(VERSION_FRAME_TITLE).find((candidate) => candidate.getAttribute('src') === versionViewPagePath({ documentId: DOCUMENT_ID, sequence }));
  if (!frame) throw new Error(`no frame for ${sequence}`);
  return frame as HTMLIFrameElement;
}

function sendFromFrame({ frame, origin = window.location.origin, kind = ViewerMessageKind.Ready }: { frame: HTMLIFrameElement; origin?: string; kind?: ViewerMessageKind }): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { kind }, origin, source: frame.contentWindow }));
  });
}

function pressChartAt(index: number): void {
  const chart = screen.getByTitle(STREAMGRAPH_TITLE).closest('svg')!;
  fireEvent.pointerDown(chart, { clientX: (index * 600) / (SEQUENCES.length - 1) });
}

beforeEach(() => SuperDoc.mockClear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  superDocDestroy.mockClear();
});

test('an at link opens the version in a same-origin frame and Back to live removes it', async () => {
  mockDocumentApi({ versions: { 42: [{ status: HttpStatus.Accepted, headers: { 'Retry-After': '1' } }, readyReply(42)] } });
  const { router } = renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  const frame = await screen.findByTitle(VERSION_FRAME_TITLE, {}, SLOW_WAIT);
  expect(frame).toHaveAttribute('src', versionViewPagePath({ documentId: DOCUMENT_ID, sequence: 42 }));
  expect(await screen.findByText(/Version at/)).toBeVisible();
  expect(screen.getByTestId('version-banner')).toHaveAttribute('data-sequence', '42');
  await userEvent.click(screen.getByRole('button', { name: BACK_TO_LIVE_LABEL }));
  expect(router.state.location.search).toBe('');
  expect(screen.queryByTitle(VERSION_FRAME_TITLE)).toBeNull();
  expect(SuperDoc).toHaveBeenCalledTimes(1);
  expect(superDocDestroy).not.toHaveBeenCalled();
  expect(screen.getByTestId('document-editor')).not.toHaveAttribute('inert');
});

test('an inaccessible document never requests a version', async () => {
  const fetchSpy = mockDocumentApi({ openedStatus: HttpStatus.NotFound });
  renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  expect(await screen.findByText(DOCUMENT_UNAVAILABLE_MESSAGE)).toBeVisible();
  expect(versionRequests(fetchSpy)).toEqual([]);
  expect(screen.queryByTitle(VERSION_FRAME_TITLE)).toBeNull();
});

test('a failed version shows the message and stops polling', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const fetchSpy = mockDocumentApi({ versions: { 42: [{ status: HttpStatus.ServiceUnavailable, headers: { 'Retry-After': '2' } }] } });
  renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  expect(await screen.findByText(VERSION_FAILED_MESSAGE)).toBeVisible();
  expect(screen.queryByTitle(VERSION_FRAME_TITLE)).toBeNull();
  const requestsBefore = versionRequests(fetchSpy).length;
  await vi.advanceTimersByTimeAsync(10_000);
  expect(versionRequests(fetchSpy)).toHaveLength(requestsBefore);
});

test('the previous frame stays until the next one is ready and foreign messages are ignored', async () => {
  mockDocumentApi({ versions: { 42: [readyReply(42)], 50: [readyReply(50)] } });
  renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  const frameA = await screen.findByTitle(VERSION_FRAME_TITLE);
  sendFromFrame({ frame: frameA as HTMLIFrameElement });
  await waitFor(() => expect(frameA).not.toHaveAttribute('aria-hidden', 'true'));
  pressChartAt(2);
  await waitFor(() => expect(screen.getAllByTitle(VERSION_FRAME_TITLE)).toHaveLength(2), SLOW_WAIT);
  const frameB = frameFor(50);
  expect(frameB).toHaveAttribute('aria-hidden', 'true');
  expect(frameB).toHaveClass('invisible');
  sendFromFrame({ frame: frameB, origin: EVIL_ORIGIN });
  sendFromFrame({ frame: frameFor(42) });
  expect(frameB).toHaveAttribute('aria-hidden', 'true');
  sendFromFrame({ frame: frameB });
  await waitFor(() => expect(screen.getAllByTitle(VERSION_FRAME_TITLE)).toHaveLength(1));
  expect(frameFor(50)).not.toHaveAttribute('aria-hidden', 'true');
});

test('the selected bin runs are sent to the ready frame', async () => {
  mockDocumentApi({ versions: { 42: [readyReply(42)] }, edits: { binStart: BIN_STARTS[1]!, binMs: versionedTimeline.binMs, runs: RUNS, authors: { ana: { id: '1', name: 'Ana' } } } });
  renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  const frame = (await screen.findByTitle(VERSION_FRAME_TITLE)) as HTMLIFrameElement;
  const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
  sendFromFrame({ frame });
  await waitFor(() => expect(postMessage).toHaveBeenCalledWith({ kind: ViewerMessageKind.Highlight, runs: RUNS }, window.location.origin));
});

test('scrubbing commits one URL change per pause, pushing once and then replacing', async () => {
  mockDocumentApi({ versions: Object.fromEntries(SEQUENCES.map((sequence) => [sequence, [readyReply(sequence)]])) });
  const { router } = renderWithProviders(<DocumentPage />, { route: PAGE_ROUTE });
  await screen.findByTitle(STREAMGRAPH_TITLE);
  pressChartAt(0);
  await waitFor(() => expect(router.state.location.search).toBe(`?at=${BIN_STARTS[0]}`), SLOW_WAIT);
  await act(async () => undefined);
  expect(router.state.historyAction).toBe('PUSH');
  const locations: string[] = [];
  const unsubscribe = router.subscribe((state) => locations.push(state.location.search));
  const band = screen.getByLabelText(/^Budget,/);
  fireEvent.keyDown(band, { key: 'ArrowRight' });
  fireEvent.keyDown(band, { key: 'ArrowRight' });
  fireEvent.keyDown(band, { key: 'ArrowRight' });
  expect(router.state.location.search).toBe(`?at=${BIN_STARTS[0]}`);
  await waitFor(() => expect(router.state.location.search).toBe(`?at=${BIN_STARTS[3]}`), { timeout: SCRUB_DEBOUNCE_MS * 5 });
  unsubscribe();
  expect(locations).toEqual([`?at=${BIN_STARTS[3]}`]);
  expect(router.state.historyAction).toBe('REPLACE');
});

test('a reload reselects the same bin and shows its version', async () => {
  mockDocumentApi({ versions: { 50: [readyReply(50)] } });
  renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[2]}` });
  const frame = await screen.findByTitle(VERSION_FRAME_TITLE);
  expect(frame).toHaveAttribute('src', versionViewPagePath({ documentId: DOCUMENT_ID, sequence: 50 }));
  const rule = screen.getByTitle(STREAMGRAPH_TITLE).closest('svg')!.querySelector('line')!;
  expect(rule).toHaveAttribute('x1', String((2 * 600) / (SEQUENCES.length - 1)));
});

test('the live editor stays mounted and inert while viewing', async () => {
  mockDocumentApi({ versions: { 42: [readyReply(42)] } });
  renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  await screen.findByTitle(VERSION_FRAME_TITLE);
  expect(screen.getByTestId('document-editor')).toHaveAttribute('inert');
  expect(superDocDestroy).not.toHaveBeenCalled();
});

test('Escape before the pause cancels the pending scrub', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockDocumentApi({ versions: { 42: [readyReply(42)] } });
  const { router } = renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  await screen.findByTitle(VERSION_FRAME_TITLE);
  const band = screen.getByLabelText(/^Budget,/);
  fireEvent.keyDown(band, { key: 'ArrowRight' });
  fireEvent.keyDown(band, { key: 'Escape' });
  await vi.advanceTimersByTimeAsync(SCRUB_DEBOUNCE_MS * 3);
  expect(router.state.location.search).toBe('');
});

test('a URL change during the pause is not overwritten by the pending scrub', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockDocumentApi({ versions: { 42: [readyReply(42)], 41: [readyReply(41)] } });
  const { router } = renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  await screen.findByTitle(VERSION_FRAME_TITLE);
  fireEvent.keyDown(screen.getByLabelText(/^Budget,/), { key: 'ArrowRight' });
  await act(async () => router.navigate(`${PAGE_ROUTE}?at=${BIN_STARTS[0]}`));
  await vi.advanceTimersByTimeAsync(SCRUB_DEBOUNCE_MS * 3);
  expect(router.state.location.search).toBe(`?at=${BIN_STARTS[0]}`);
});

test('a moment still loading its timeline shows progress instead of an empty banner', async () => {
  mockDocumentApi({ holdTimeline: true });
  renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  expect(await screen.findByTestId('version-banner')).toHaveTextContent(LOADING_VERSION_MESSAGE);
});

test('a moment without a version yet shows progress up to the end of its period', async () => {
  const withoutVersion: DocumentTimeline = { ...versionedTimeline, bins: versionedTimeline.bins.map((bin, index) => ({ ...bin, versionSequence: index === 1 ? null : bin.versionSequence })) };
  mockDocumentApi({ timelines: [withoutVersion] });
  renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  const endOfPeriod = formatTimestamp(BIN_STARTS[1]! + versionedTimeline.binMs);
  await waitFor(() => expect(screen.getByTestId('version-banner')).toHaveTextContent(endOfPeriod));
  expect(screen.getByTestId('version-banner')).toHaveTextContent(LOADING_VERSION_MESSAGE);
  expect(screen.queryByTitle(VERSION_FRAME_TITLE)).toBeNull();
});

test('a frame that reports a failure replaces the version with the failure message', async () => {
  mockDocumentApi({ versions: { 42: [readyReply(42)] } });
  renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  const frame = (await screen.findByTitle(VERSION_FRAME_TITLE)) as HTMLIFrameElement;
  sendFromFrame({ frame, kind: ViewerMessageKind.Failed });
  expect(await screen.findByText(VERSION_FAILED_MESSAGE)).toBeVisible();
  expect(screen.getByTestId('version-banner')).not.toHaveAttribute('data-sequence');
  expect(screen.queryByTitle(VERSION_FRAME_TITLE)).toBeNull();
});

test('runs reach only the frame of the requested version', async () => {
  mockDocumentApi({
    versions: { 42: [readyReply(42)], 50: [readyReply(50)] },
    edits: { binStart: BIN_STARTS[2]!, binMs: versionedTimeline.binMs, runs: RUNS, authors: { ana: { id: '1', name: 'Ana' } } },
  });
  renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  const frameA = (await screen.findByTitle(VERSION_FRAME_TITLE)) as HTMLIFrameElement;
  sendFromFrame({ frame: frameA });
  const postToA = vi.spyOn(frameA.contentWindow!, 'postMessage');
  pressChartAt(2);
  await waitFor(() => expect(screen.getAllByTitle(VERSION_FRAME_TITLE)).toHaveLength(2), SLOW_WAIT);
  await act(async () => undefined);
  expect(postToA).not.toHaveBeenCalledWith({ kind: ViewerMessageKind.Highlight, runs: RUNS }, window.location.origin);
  const frameB = frameFor(50);
  const postToB = vi.spyOn(frameB.contentWindow!, 'postMessage');
  sendFromFrame({ frame: frameB });
  await waitFor(() => expect(postToB).toHaveBeenCalledWith({ kind: ViewerMessageKind.Highlight, runs: RUNS }, window.location.origin));
});

function withSequence({ binIndex, sequence }: { binIndex: number; sequence: number }): DocumentTimeline {
  return { ...versionedTimeline, bins: versionedTimeline.bins.map((bin, index) => ({ ...bin, versionSequence: index === binIndex ? sequence : bin.versionSequence })) };
}

function timelineRequestCount(fetchSpy: ReturnType<typeof mockDocumentApi>): number {
  return fetchSpy.mock.calls.filter(([path]) => String(path).split('?')[0] === documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Timeline })).length;
}

test('a poll that reports a newer version for the viewed period does not move the viewer', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const fetchSpy = mockDocumentApi({ versions: { 42: [readyReply(42)], 43: [readyReply(43)] }, timelines: [versionedTimeline, withSequence({ binIndex: 1, sequence: 43 })] });
  renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  await screen.findByTitle(VERSION_FRAME_TITLE);
  await vi.advanceTimersByTimeAsync(TIMELINE_POLL_MS * 2);
  expect(timelineRequestCount(fetchSpy)).toBeGreaterThan(1);
  expect(versionRequests(fetchSpy).some((path) => path.endsWith('/43'))).toBe(false);
  expect(screen.getAllByTitle(VERSION_FRAME_TITLE)).toHaveLength(1);
  expect(screen.getByTestId('version-banner')).toHaveAttribute('data-sequence', '42');
});

test('moving to another period resolves its version again', async () => {
  const fetchSpy = mockDocumentApi({ versions: { 42: [readyReply(42)], 50: [readyReply(50)] } });
  const { router } = renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  await screen.findByTitle(VERSION_FRAME_TITLE);
  await act(async () => router.navigate(`${PAGE_ROUTE}?at=${BIN_STARTS[2]}`));
  await waitFor(() => expect(screen.getAllByTitle(VERSION_FRAME_TITLE)).toHaveLength(2));
  expect(frameFor(50)).toBeInTheDocument();
  expect(versionRequests(fetchSpy).some((path) => path.endsWith('/50'))).toBe(true);
});

test('an at set before the timeline arrives resolves its version once when it does', async () => {
  let openGate!: () => void;
  const timelineGate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  const fetchSpy = mockDocumentApi({ versions: { 42: [readyReply(42)] }, timelineGate });
  renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  expect(await screen.findByTestId('version-banner')).toHaveTextContent(LOADING_VERSION_MESSAGE);
  expect(versionRequests(fetchSpy)).toEqual([]);
  openGate();
  const frame = await screen.findByTitle(VERSION_FRAME_TITLE);
  expect(frame).toHaveAttribute('src', versionViewPagePath({ documentId: DOCUMENT_ID, sequence: 42 }));
  expect(versionRequests(fetchSpy)).toHaveLength(1);
});

test('below the wide layout the editor keeps a usable height and the panel stacks under it', async () => {
  mockDocumentApi();
  renderWithProviders(<DocumentPage />, { route: PAGE_ROUTE });
  const area = await screen.findByTestId('editor-area');
  expect(area.className).toContain('min-h-[60dvh]');
  expect(area.className).toContain('lg:min-h-0');
  expect(screen.getByRole('separator').closest('aside')).toHaveClass('shrink-0');
  expect(screen.getByRole('separator').closest('aside')!.className).toContain('max-h-[50dvh]');
});

test('a document that disappears while viewing stops every poll', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  let isGone = false;
  const fetchSpy = mockDocumentApi({ versions: { 42: [readyReply(42)] }, isGone: () => isGone });
  renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  await screen.findByTitle(VERSION_FRAME_TITLE);
  isGone = true;
  await vi.advanceTimersByTimeAsync(MEMBERS_REFRESH_MS + TIMELINE_POLL_MS);
  expect(await screen.findByText(DOCUMENT_UNAVAILABLE_MESSAGE)).toBeVisible();
  const requestsAtGone = fetchSpy.mock.calls.length;
  await vi.advanceTimersByTimeAsync(TIMELINE_POLL_MS * 10);
  expect(fetchSpy.mock.calls).toHaveLength(requestsAtGone);
});

test('Escape leaves the version from anywhere but a field being typed in', async () => {
  mockDocumentApi({ versions: { 42: [readyReply(42)] } });
  const { router } = renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  await screen.findByTitle(VERSION_FRAME_TITLE);
  const filter = screen.getByLabelText(FILTER_LABEL);
  fireEvent.change(filter, { target: { value: 'bud' } });
  fireEvent.keyDown(filter, { key: 'Escape' });
  expect(router.state.location.search).toBe(`?at=${BIN_STARTS[1]}`);
  expect(filter).toHaveValue('');
  fireEvent.keyDown(filter, { key: 'Escape' });
  await waitFor(() => expect(router.state.location.search).toBe(''));
  expect(screen.queryByTitle(VERSION_FRAME_TITLE)).toBeNull();
});

test('Escape inside the version frame leaves the version and a foreign frame cannot', async () => {
  mockDocumentApi({ versions: { 42: [readyReply(42)] } });
  const { router } = renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  const frame = (await screen.findByTitle(VERSION_FRAME_TITLE)) as HTMLIFrameElement;
  sendFromFrame({ frame, kind: ViewerMessageKind.Exit, origin: EVIL_ORIGIN });
  expect(router.state.location.search).toBe(`?at=${BIN_STARTS[1]}`);
  sendFromFrame({ frame, kind: ViewerMessageKind.Exit });
  await waitFor(() => expect(router.state.location.search).toBe(''));
});

test('Escape on a focused band leaves the version once', async () => {
  mockDocumentApi({ versions: { 42: [readyReply(42)] } });
  const { router } = renderWithProviders(<DocumentPage />, { route: `${PAGE_ROUTE}?at=${BIN_STARTS[1]}` });
  await screen.findByTitle(VERSION_FRAME_TITLE);
  const locations: string[] = [];
  const unsubscribe = router.subscribe((state) => locations.push(state.location.search));
  fireEvent.keyDown(screen.getByLabelText(/^Budget,/), { key: 'Escape' });
  await waitFor(() => expect(router.state.location.search).toBe(''));
  unsubscribe();
  expect(locations).toEqual(['']);
});
