import {
  BootstrapStage,
  DEVICE_PREVIEW_MIN_MEMORY_GIGABYTES,
  OPEN_PROGRESS_DELAY_MS,
  ApiPath,
  AppRoute,
  ClientActor,
  ConnectionFailureReason,
  ConnectionState,
  DOCUMENT_READY_POLL_MS,
  DOCUMENT_UNAVAILABLE_MESSAGE,
  documentApiPath,
  documentPagePath,
  DocumentResource,
  DocumentRole,
  HttpMethod,
  HEAVY_ROOMS_FULL_MESSAGE,
  HEAVY_ROOMS_USER_CAP_MESSAGE,
  HttpStatus,
  MEMBERS_REFRESH_MS,
  RoomMode,
  selectionSummaryApiPath,
  SelectionSummaryState,
  TAB_QUERY_KEY,
  SummarizeOutcome,
  SummarizeStep,
  type OpenedDocument,
  type SelectionSummaryView,
} from '@superdoc-collab/types';
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { tabId } from '@/lib/tab-id';
import { HIDDEN_LOADING_OVERLAY_CLASS } from './superdoc-editor';
import { PanelPosition, PANEL_POSITION_STORAGE_KEY } from '@/features/timeline/use-panel-position';
import { GROUPING_TOPICS_MESSAGE, SUMMARIZE_EDITS_LABEL } from '@/features/timeline/timeline-copy';
import { pageTitle } from '@/lib/use-document-title';
import { jsonResponse } from '@/testing/json-response';
import { installAuthorPalette, removeAuthorPalette } from '@/testing/author-palette';
import { pagesSoFarDetail } from '@/features/open-progress/open-progress-copy';
import { OpenStage } from '@/features/open-progress/open-stage';
import { bootstrapAt, DOCUMENT_ID, DOCUMENT_TITLE, EDITOR_USER, openedAs, SESSION_USER } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import { timelineWith } from '@/testing/timeline-fixtures';
import { FAILURE_REASON_COPY, RELOAD_FAILED_MESSAGE, RELOAD_LABEL, RELOADING_LABEL, SIGN_IN_LABEL } from './connection-copy';
import {
  BACK_TO_DOCUMENTS_LABEL,
  CANCEL_TITLE_LABEL,
  DOCUMENT_LOAD_ERROR_MESSAGE,
  DOWNLOAD_BUTTON_LABEL,
  DOWNLOAD_PDF_LABEL,
  DELETE_CONFIRM_LABEL,
  DELETE_LABEL,
  MORE_ACTIONS_LABEL,
  EDITOR_ESCAPE_HINT,
  EDITOR_EXIT_LABEL,
  EDIT_REJECTED_MESSAGE,
  EDITOR_FAILED_MESSAGE,
  EXIT_CONFIRMATION_TITLE,
  EXPORT_FAILED_MESSAGE,
  HOME_LINK_LABEL,
  LOADING_DOCUMENT_MESSAGE,
  renameTitleLabel,
  STAY_LABEL,
  TIMELINE_TOGGLE_LABEL,
} from './editor-copy';
import { discardLocalFile, keepLocalFile, localFileOf } from '@/features/local-preview/local-file-store';
import { DEVICE_REFUSAL_COPY } from '@/features/local-preview/local-preview-copy';
import { DeviceRefusal } from '@/features/local-preview/device-guard';
import { superdocStub } from '@/testing/superdoc-stub';
import { PREPARING_HERE_DETAIL } from '@/features/open-progress/open-progress-copy';
import { PHONE_VIEWPORT_WIDTH, stubViewportWidth, WIDE_VIEWPORT_WIDTH } from '@/testing/viewport';
import { DocumentPage } from './document-page';
import { getUnsyncedEditsSnapshot } from './unsynced-edits-store';
import { SuperDocExceptionCode } from './superdoc-exceptions';
import { DocumentMode } from './superdoc-options';
import { DOCUMENT_READY_ANNOUNCEMENT, PREPARATION_FAILED_MESSAGE, PREPARING_DOCUMENT_MESSAGE } from './waiting-copy';
import { BLANK_DOCX_PATH, documentFileQueryKey, membersQueryKey, openedDocumentQueryKey } from './editor-api';

const NONE_VIEW: SelectionSummaryView = {
  state: SelectionSummaryState.None,
  summary: null,
  failure: null,
  isModelAvailable: true,
  step: SummarizeStep.Idle,
  partial: null,
};

type ExceptionPayload = {
  code?: string;
  collaborationReason?: string;
  diagnosticCode?: string;
  severity?: string;
  message?: string;
  error: Error;
  editor: null;
};

type SuperDocConfig = {
  telemetry: { enabled: boolean };
  onException: (payload: ExceptionPayload) => void;
  onCollaborationConnectionChange: (payload: { state: string; kind: string }) => void;
  onCollaborationReady: () => void;
  zoom: { mode: string };
  ui: { toolbar?: { container: HTMLElement } };
  onReady?: (payload: { superdoc: unknown }) => void;
  onEditorUpdate: () => void;
  onPaginationUpdate: (payload: { totalPages: number }) => void;
};

const { SuperDoc, superDocDestroy, superDocExport } = vi.hoisted(() => {
  const superDocDestroy = vi.fn();
  const superDocExport = vi.fn(() => Promise.resolve(new Blob()));
  return {
    superDocDestroy,
    superDocExport,
    SuperDoc: vi.fn(function SuperDocStub(config: SuperDocConfig) {
      const instance = { destroy: superDocDestroy, export: superDocExport, on: vi.fn(), off: vi.fn() };
      config.onReady?.({ superdoc: instance });
      return instance;
    }),
  };
});

vi.mock('superdoc', () => ({ SuperDoc }));
vi.mock('superdoc/style.css', () => ({}));

const DOCUMENT_PATH = documentApiPath({ documentId: DOCUMENT_ID });
const OPEN_PATH = `${DOCUMENT_PATH}?${TAB_QUERY_KEY}=${tabId()}`;
const DOWNLOAD_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Download });
const MEMBERS_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Members });
const TIMELINE_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Timeline });
const SUMMARIES_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Summaries });
const EMPTY_TIMELINE = timelineWith({ volumes: [], names: [] });
const BASE_TIMELINE = timelineWith({ volumes: [[10]], names: ['Budget'] });
const CONTRIBUTOR_NAME = 'Ana Souza';
const TIMELINE_WITH_CONTRIBUTOR = {
  ...BASE_TIMELINE,
  authors: { ana: { id: SESSION_USER.id, name: CONTRIBUTOR_NAME, actor: ClientActor.Human } },
  contributorsByBand: {
    [BASE_TIMELINE.bands[0]!.id]: [{ authorKey: 'ana', inserted: 10, deleted: 0, wordsInserted: 2, wordsDeleted: 0 }],
  },
};
const RENAMED_TITLE = 'Renamed';
const READY_WAIT_MS = 2 * DOCUMENT_READY_POLL_MS;
const TEST_TIMEOUT_MS = 3 * DOCUMENT_READY_POLL_MS;

function mockDocumentApi({
  opened,
  renamedTitle,
  openStatus = HttpStatus.Ok,
  currentOpenStatus = () => openStatus,
  openBody = opened,
  downloadStatus = HttpStatus.Ok,
  currentMembersStatus = () => HttpStatus.Ok,
  isCurrentUserOnline = () => true,
  bootstrapStage = () => BootstrapStage.Ready,
  estimatedMs = null,
  timeline = EMPTY_TIMELINE,
  openedAfterReload,
  reloadGate = Promise.resolve(),
  isReloadUnreachable = false,
  reloadFileResponse,
}: {
  opened: OpenedDocument;
  renamedTitle?: string;
  openStatus?: HttpStatus;
  currentOpenStatus?: () => HttpStatus;
  openBody?: unknown;
  downloadStatus?: HttpStatus;
  currentMembersStatus?: () => HttpStatus;
  isCurrentUserOnline?: () => boolean;
  bootstrapStage?: () => BootstrapStage;
  estimatedMs?: number | null;
  timeline?: typeof EMPTY_TIMELINE;
  openedAfterReload?: OpenedDocument;
  reloadGate?: Promise<void>;
  isReloadUnreachable?: boolean;
  reloadFileResponse?: () => Response;
}) {
  let current = opened;
  let summaryStep = SummarizeStep.Idle;
  let openRequests = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (input === ApiPath.Me) return jsonResponse({ body: { user: SESSION_USER } });
    if (String(input).startsWith(MEMBERS_PATH)) {
      return jsonResponse({
        body: {
          members: [],
          agents: [],
          isCurrentUserOnline: isCurrentUserOnline(),
        },
        status: currentMembersStatus(),
      });
    }
    if (input === DOWNLOAD_PATH && openRequests > 1 && reloadFileResponse) return reloadFileResponse();
    if (input === DOWNLOAD_PATH) return new Response(new Uint8Array([1, 2, 3]), { status: downloadStatus });
    if (String(input).split('?')[0] === TIMELINE_PATH) return jsonResponse({ body: timeline });
    if (String(input).split('?')[0] === SUMMARIES_PATH) return jsonResponse({ body: { summaries: [] } });
    if (String(input).split('?')[0] === selectionSummaryApiPath(DOCUMENT_ID) && init?.method === HttpMethod.Post) {
      summaryStep = SummarizeStep.Grouping;
      return jsonResponse({
        body: { ...NONE_VIEW, step: summaryStep, outcome: SummarizeOutcome.Started },
        status: HttpStatus.Accepted,
      });
    }
    if (String(input).split('?')[0] === selectionSummaryApiPath(DOCUMENT_ID))
      return jsonResponse({ body: { ...NONE_VIEW, step: summaryStep } });
    if (input === BLANK_DOCX_PATH) return new Response(new Uint8Array([1, 2, 3]));
    if (input === DOCUMENT_PATH && init?.method === HttpMethod.Patch && renamedTitle) {
      current = { ...current, document: { ...current.document, title: renamedTitle } };
      return new Response(null, { status: HttpStatus.NoContent });
    }
    if (input === DOCUMENT_PATH && init?.method === HttpMethod.Delete) return new Response(null, { status: HttpStatus.NoContent });
    if (input === OPEN_PATH) {
      const status = currentOpenStatus();
      openRequests += 1;
      const isReload = openRequests > 1;
      const reloadedBody = isReload && openedAfterReload ? openedAfterReload : current;
      if (isReload) await reloadGate;
      if (isReload && isReloadUnreachable) throw new TypeError('Failed to fetch');
      const answeredStage = bootstrapStage();
      const answeredRoomMode = answeredStage === BootstrapStage.Ready ? reloadedBody.roomMode : RoomMode.Join;
      const answered =
        status === HttpStatus.Ok
          ? { ...reloadedBody, roomMode: answeredRoomMode, bootstrap: { ...bootstrapAt(answeredStage), estimatedMs } }
          : openBody;
      return jsonResponse({ body: answered, status });
    }
    throw new Error(`unexpected request ${String(input)}`);
  });
}

function constructedConfig(): SuperDocConfig {
  const firstCall = SuperDoc.mock.calls.at(0);
  if (!firstCall) throw new Error('SuperDoc was not constructed');
  return firstCall[0];
}

const VIEWED_AT = 1_700_000_000_000;
const RENDER_WARNING = 'render hiccup';
const LOST_CALLBACK = { state: 'degraded', kind: 'lost' };
const SYNCED_CALLBACK = { state: 'synced', kind: 'initial' };
const FAILED_CALLBACK = { state: 'failed', kind: 'failed' };

function warnDiagnostic(): ExceptionPayload {
  return { diagnosticCode: 'RENDER_ERROR', severity: 'warn', message: RENDER_WARNING, error: new Error(RENDER_WARNING), editor: null };
}

async function reloadAfterFailure(): Promise<SuperDocConfig> {
  mockDocumentApi({
    opened: openedAs(DocumentRole.Owner, RoomMode.Create),
    openedAfterReload: openedAs(DocumentRole.Owner, RoomMode.Join),
  });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const firstInstanceConfig = constructedConfig();
  act(() => firstInstanceConfig.onCollaborationConnectionChange(SYNCED_CALLBACK));
  act(() => firstInstanceConfig.onCollaborationConnectionChange(FAILED_CALLBACK));
  await userEvent.click(await screen.findByRole('button', { name: RELOAD_LABEL }));
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(2));
  return firstInstanceConfig;
}

beforeEach(() => {
  localStorage.clear();
  discardLocalFile(DOCUMENT_ID);
  SuperDoc.mockClear();
  installAuthorPalette();
});
function stubDeviceMemory(gigabytes: number): void {
  Object.defineProperty(navigator, 'deviceMemory', { value: gigabytes, configurable: true });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'deviceMemory');
  removeAuthorPalette();
  vi.restoreAllMocks();
  superDocDestroy.mockClear();
  superDocExport.mockClear();
});

test('the editor opens SuperDoc with its telemetry disabled', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  expect(SuperDoc.mock.calls[0]![0].telemetry).toEqual({ enabled: false });
});

test('a title rename does not re-create the editor', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner), renamedTitle: RENAMED_TITLE });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  await userEvent.click(await screen.findByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) }));
  await userEvent.keyboard(`${RENAMED_TITLE}{Enter}`);
  await screen.findByRole('button', { name: renameTitleLabel(RENAMED_TITLE) });
  expect(SuperDoc).toHaveBeenCalledTimes(1);
  expect(superDocDestroy).not.toHaveBeenCalled();
});

test('a title rename never opens the document again, so the creator ticket stays', async () => {
  const fetchSpy = mockDocumentApi({ opened: openedAs(DocumentRole.Owner), renamedTitle: RENAMED_TITLE });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await userEvent.click(await screen.findByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) }));
  await userEvent.keyboard(`${RENAMED_TITLE}{Enter}`);
  await screen.findByRole('button', { name: renameTitleLabel(RENAMED_TITLE) });
  const openRequests = fetchSpy.mock.calls.filter(([input, init]) => input === OPEN_PATH);
  expect(openRequests).toHaveLength(1);
});

test(
  'a waiting page whose poll answers Ready announces the document is ready and mounts the editor',
  async () => {
    let isBootstrapped = false;
    mockDocumentApi({
      opened: openedAs(DocumentRole.Reader),
      bootstrapStage: () => (isBootstrapped ? BootstrapStage.Ready : BootstrapStage.Queued),
    });
    renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
    await screen.findByText(PREPARING_DOCUMENT_MESSAGE, {}, { timeout: PROGRESS_WAIT_MS });
    isBootstrapped = true;
    const announcement = await screen.findByText(DOCUMENT_READY_ANNOUNCEMENT, {}, { timeout: READY_WAIT_MS });
    expect(announcement).toHaveAttribute('role', 'status');
    await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  },
  TEST_TIMEOUT_MS,
);

test('a 404 shows the unavailable message and a link to the documents list', async () => {
  mockDocumentApi({
    opened: openedAs(DocumentRole.Reader),
    openStatus: HttpStatus.NotFound,
    openBody: { error: DOCUMENT_UNAVAILABLE_MESSAGE },
  });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  expect(await screen.findByText(DOCUMENT_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: BACK_TO_DOCUMENTS_LABEL })).toHaveAttribute('href', '/documents');
  expect(SuperDoc).not.toHaveBeenCalled();
});

test('joining fetches the blank document and never the download', async () => {
  const fetchSpy = mockDocumentApi({ opened: openedAs(DocumentRole.Editor, RoomMode.Join) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const requestedPaths = fetchSpy.mock.calls.map(([input]) => input);
  expect(requestedPaths).toContain(BLANK_DOCX_PATH);
  expect(requestedPaths).not.toContain(DOWNLOAD_PATH);
});

test('creating fetches the stored download and a reader gets the viewing mode', async () => {
  const fetchSpy = mockDocumentApi({ opened: openedAs(DocumentRole.Reader, RoomMode.Create) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const requestedPaths = fetchSpy.mock.calls.map(([input]) => input);
  expect(requestedPaths).toContain(DOWNLOAD_PATH);
  expect(requestedPaths).not.toContain(BLANK_DOCX_PATH);
  expect(SuperDoc).toHaveBeenCalledWith(
    expect.objectContaining({ documentMode: DocumentMode.Viewing, user: expect.objectContaining(EDITOR_USER) }),
  );
});

test('a rejected file fetch shows the load error instead of an empty pane', async () => {
  matchMediaAlwaysMatching();
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner), downloadStatus: HttpStatus.NotFound });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  expect(await screen.findByRole('alert')).toHaveTextContent(DOCUMENT_LOAD_ERROR_MESSAGE);
  expect(SuperDoc).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: DOWNLOAD_BUTTON_LABEL })).toHaveAccessibleDescription(DOCUMENT_LOAD_ERROR_MESSAGE);
});

test('an editor exception shows the editor failure', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const firstCall = SuperDoc.mock.calls.at(0);
  if (!firstCall) throw new Error('SuperDoc was not constructed');
  act(() => firstCall[0].onException({ error: new Error('boom'), editor: null }));
  expect(await screen.findByRole('alert')).toHaveTextContent(EDITOR_FAILED_MESSAGE);
});

test('a rejected edit shows a status that a key keeps and a click on the editor clears, with no failure', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const firstCall = SuperDoc.mock.calls.at(0);
  if (!firstCall) throw new Error('SuperDoc was not constructed');
  act(() => firstCall[0].onException({ code: SuperDocExceptionCode.EditRejected, error: new Error('rejected'), editor: null }));
  expect(await screen.findByText(EDIT_REJECTED_MESSAGE)).toHaveAttribute('role', 'status');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  const editor = screen.getByTestId('document-editor');
  fireEvent.keyDown(editor, { key: 'a' });
  expect(screen.getByText(EDIT_REJECTED_MESSAGE)).toBeInTheDocument();
  fireEvent.pointerDown(editor);
  expect(screen.getByText(EDIT_REJECTED_MESSAGE)).toBeInTheDocument();
  fireEvent.click(editor);
  expect(screen.queryByText(EDIT_REJECTED_MESSAGE)).not.toBeInTheDocument();
});

test('the editor is destroyed when the page unmounts', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  cleanup();
  expect(superDocDestroy).toHaveBeenCalledTimes(1);
});

test('a cached create followed by a fresh join from the server builds the join setup', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(openedDocumentQueryKey(DOCUMENT_ID), openedAs(DocumentRole.Editor, RoomMode.Create));
  const fetchSpy = mockDocumentApi({ opened: openedAs(DocumentRole.Editor, RoomMode.Join) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID), queryClient });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  expect(SuperDoc).toHaveBeenCalledWith(
    expect.objectContaining({
      documents: [expect.objectContaining({ v2Collaboration: expect.objectContaining({ roomMode: RoomMode.Join }) })],
    }),
  );
  expect(fetchSpy.mock.calls.map(([input]) => input)).not.toContain(DOWNLOAD_PATH);
});

test('a members 404 after the editor mounted shows the unavailable message, destroys the editor and stops polling', async () => {
  let membersStatus = HttpStatus.Ok;
  mockDocumentApi({ opened: openedAs(DocumentRole.Editor), currentMembersStatus: () => membersStatus });
  const { queryClient } = renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  membersStatus = HttpStatus.NotFound;
  await act(() => queryClient.invalidateQueries({ queryKey: membersQueryKey(DOCUMENT_ID) }));
  expect(await screen.findByText(DOCUMENT_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: BACK_TO_DOCUMENTS_LABEL })).toHaveAttribute('href', '/documents');
  expect(superDocDestroy).toHaveBeenCalledTimes(1);
  const membersQuery = queryClient.getQueryCache().find({ queryKey: membersQueryKey(DOCUMENT_ID), exact: false });
  const refetchInterval = membersQuery?.observers[0]?.options.refetchInterval;
  if (typeof refetchInterval !== 'function' || !membersQuery) throw new Error('members polling is not a function of the query state');
  expect(refetchInterval(membersQuery)).toBe(false);
});

test('the header download exports the live document and a reader can use it', async () => {
  matchMediaAlwaysMatching();
  mockDocumentApi({ opened: openedAs(DocumentRole.Reader, RoomMode.Join) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  await userEvent.click(await screen.findByRole('button', { name: DOWNLOAD_BUTTON_LABEL }));
  expect(superDocExport).toHaveBeenCalledTimes(1);
  expect(superDocExport).toHaveBeenCalledWith(expect.objectContaining({ triggerDownload: true }));
});

test('a failed export shows an alert instead of an unhandled rejection', async () => {
  matchMediaAlwaysMatching();
  superDocExport.mockRejectedValueOnce(new Error('export boom'));
  mockDocumentApi({ opened: openedAs(DocumentRole.Editor, RoomMode.Join) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  await userEvent.click(await screen.findByRole('button', { name: DOWNLOAD_BUTTON_LABEL }));
  expect(await screen.findByRole('alert')).toHaveTextContent(EXPORT_FAILED_MESSAGE);
});

test('Escape inside the editor moves focus past it so Tab can leave', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Editor, RoomMode.Join) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  const container = await screen.findByTestId('document-editor');
  const editable = document.createElement('textarea');
  container.append(editable);
  editable.focus();
  fireEvent.keyDown(editable, { key: 'Escape' });
  expect(document.activeElement).toBe(screen.getByText(EDITOR_EXIT_LABEL));
  expect(screen.getByText(EDITOR_ESCAPE_HINT)).toBeInTheDocument();
});

test('Escape on the reading surface of a viewer moves focus past the editor too', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Reader, RoomMode.Join) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  const container = await screen.findByTestId('document-editor');
  const readingSurface = document.createElement('div');
  readingSurface.setAttribute('role', 'document');
  readingSurface.tabIndex = 0;
  container.append(readingSurface);
  readingSurface.focus();
  fireEvent.keyDown(readingSurface, { key: 'Escape' });
  expect(document.activeElement).toBe(screen.getByText(EDITOR_EXIT_LABEL));
});

test('the header stays while the document opens', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (input === ApiPath.Me) return jsonResponse({ body: { user: SESSION_USER } });
    return new Promise<Response>(() => undefined);
  });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  expect(await screen.findByRole('link', { name: HOME_LINK_LABEL })).toBeVisible();
  expect(screen.getByText(LOADING_DOCUMENT_MESSAGE)).toHaveAttribute('role', 'status');
});

test('the browser tab names the open document', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(document.title).toBe(pageTitle(DOCUMENT_TITLE)));
});

test('the editor never takes the focus on its own', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  expect(document.body).toHaveFocus();
});

function matchMediaAlwaysMatching(): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
  );
}

function panelElement(): HTMLElement {
  const panel = document.querySelector<HTMLElement>('[data-position]');
  if (!panel) throw new Error('the edits panel is not rendered');
  return panel;
}

test('below 1024 the editor area comes before the panel in the DOM and data-position is bottom, and at 1536 with Side stored data-position is side', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  const editorArea = await screen.findByTestId('editor-area');
  await waitFor(() => expect(panelElement()).toHaveAttribute('data-position', PanelPosition.Bottom));
  expect(editorArea.compareDocumentPosition(panelElement()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  cleanup();

  localStorage.setItem(PANEL_POSITION_STORAGE_KEY, PanelPosition.Side);
  matchMediaAlwaysMatching();
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(panelElement()).toHaveAttribute('data-position', PanelPosition.Side));
});

test('a click on Summarize with the panel collapsed opens it and the card shows Grouping', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner), timeline: BASE_TIMELINE });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await userEvent.click(await screen.findByRole('button', { name: SUMMARIZE_EDITS_LABEL }));
  expect(await screen.findByText(GROUPING_TOPICS_MESSAGE)).toBeVisible();
});

test('an editor gets the toolbar container of the row and a reader gets none', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  expect(constructedConfig().ui.toolbar?.container).toBe(screen.getByTestId('toolbar-container'));
  cleanup();
  SuperDoc.mockClear();

  mockDocumentApi({ opened: openedAs(DocumentRole.Reader) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  expect(constructedConfig().ui.toolbar).toBeUndefined();
  expect(screen.queryByTestId('toolbar-container')).toBeNull();
});

test('while the editor is mounted but not ready, the Download button is described by the loading reason', async () => {
  SuperDoc.mockImplementationOnce(function SuperDocNotReadyStub() {
    return { destroy: superDocDestroy, export: superDocExport, on: vi.fn(), off: vi.fn() };
  });
  matchMediaAlwaysMatching();
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: DOWNLOAD_BUTTON_LABEL })).toHaveAccessibleDescription(LOADING_DOCUMENT_MESSAGE);
});

test('while the editor is mounted but not ready, the More actions download items are described by the loading reason', async () => {
  SuperDoc.mockImplementationOnce(function SuperDocNotReadyStub() {
    return { destroy: superDocDestroy, export: superDocExport, on: vi.fn(), off: vi.fn() };
  });
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  expect(await screen.findByRole('menuitem', { name: DOWNLOAD_PDF_LABEL })).toHaveAccessibleDescription(LOADING_DOCUMENT_MESSAGE);
});

test('a lost callback shows the banner above the version banner', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner), isCurrentUserOnline: () => false });
  renderWithProviders(<DocumentPage />, { route: `${documentPagePath(DOCUMENT_ID)}?at=${VIEWED_AT}` });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  act(() => constructedConfig().onCollaborationReady());
  act(() => constructedConfig().onCollaborationConnectionChange(LOST_CALLBACK));
  const connectionBanner = await screen.findByTestId('connection-banner');
  const versionBanner = await screen.findByTestId('version-banner');
  expect(connectionBanner).toHaveAttribute('data-state', ConnectionState.Lost);
  expect(connectionBanner.compareDocumentPosition(versionBanner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('a warn diagnostic keeps the editor usable and logs with console.warn', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  act(() => constructedConfig().onException(warnDiagnostic()));
  expect(warn).toHaveBeenCalledWith(RENDER_WARNING);
  expect(screen.queryByText(EDITOR_FAILED_MESSAGE)).not.toBeInTheDocument();
  expect(screen.queryByTestId('connection-banner')).not.toBeInTheDocument();
  expect(screen.getByTestId('document-editor')).not.toHaveAttribute('inert');
});

test('a failed report before the first sync shows the editor failure notice', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  act(() => constructedConfig().onCollaborationConnectionChange(FAILED_CALLBACK));
  expect(await screen.findByText(EDITOR_FAILED_MESSAGE)).toBeInTheDocument();
});

test('a lost report before the editor is ready is ignored, so a blip mid-create neither fails nor shows the banner', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  act(() => constructedConfig().onCollaborationConnectionChange(LOST_CALLBACK));
  expect(screen.queryByText(EDITOR_FAILED_MESSAGE)).not.toBeInTheDocument();
  expect(screen.queryByTestId('connection-banner')).not.toBeInTheDocument();
});

test('a lost then failed report after the editor was ready reaches the banner', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  act(() => constructedConfig().onCollaborationReady());
  act(() => constructedConfig().onCollaborationConnectionChange(LOST_CALLBACK));
  act(() => constructedConfig().onCollaborationConnectionChange(FAILED_CALLBACK));
  expect(await screen.findByRole('alert')).toHaveAttribute('data-state', ConnectionState.Failed);
  expect(screen.queryByText(EDITOR_FAILED_MESSAGE)).not.toBeInTheDocument();
});

test('a failed report after the first sync keeps the banner and shows no editor failure notice', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  act(() => constructedConfig().onCollaborationConnectionChange(SYNCED_CALLBACK));
  act(() => constructedConfig().onCollaborationConnectionChange(FAILED_CALLBACK));
  expect(await screen.findByRole('alert')).toHaveAttribute('data-state', ConnectionState.Failed);
  expect(screen.queryByText(EDITOR_FAILED_MESSAGE)).not.toBeInTheDocument();
});

test('a failed callback makes the editor inert, dims it and names the reason', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  act(() => constructedConfig().onCollaborationConnectionChange(SYNCED_CALLBACK));
  act(() => constructedConfig().onCollaborationConnectionChange(FAILED_CALLBACK));
  const banner = await screen.findByRole('alert');
  expect(banner).toHaveAttribute('data-state', ConnectionState.Failed);
  expect(banner).toHaveTextContent(FAILURE_REASON_COPY[ConnectionFailureReason.Unknown]);
  expect(screen.getByTestId('document-editor')).toHaveAttribute('inert');
  expect(screen.getByTestId('toolbar-container')).toHaveAttribute('inert');
  expect(screen.getByTestId('editor-toolbar-row')).toHaveAttribute('inert');
  expect(screen.getByTestId('editor-area')).toHaveClass('opacity-60');
});

test('a connection exception fails the connection with its reason and not the editor', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const payload = { code: 'collaboration-access-denied', collaborationReason: 'access-denied', error: new Error('denied'), editor: null };
  act(() => constructedConfig().onCollaborationReady());
  act(() => constructedConfig().onException(payload));
  const banner = await screen.findByRole('alert');
  await waitFor(() => expect(banner).toHaveTextContent(FAILURE_REASON_COPY[ConnectionFailureReason.AccessDenied]));
  expect(screen.queryByText(EDITOR_FAILED_MESSAGE)).not.toBeInTheDocument();
});

test('an access-denied exception while the server refuses the open with a sentence shows that sentence, and a 403 keeps the removed access line', async () => {
  const answer = { status: HttpStatus.Ok as HttpStatus };
  mockDocumentApi({
    opened: openedAs(DocumentRole.Owner),
    currentOpenStatus: () => answer.status,
    openBody: { error: HEAVY_ROOMS_USER_CAP_MESSAGE },
  });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const payload = { code: 'collaboration-access-denied', collaborationReason: 'access-denied', error: new Error('denied'), editor: null };
  act(() => constructedConfig().onCollaborationReady());
  answer.status = HttpStatus.ServiceUnavailable;
  act(() => constructedConfig().onException(payload));
  const banner = await screen.findByRole('alert');
  await waitFor(() => expect(banner).toHaveTextContent(HEAVY_ROOMS_USER_CAP_MESSAGE));
  expect(banner).not.toHaveTextContent(FAILURE_REASON_COPY[ConnectionFailureReason.AccessDenied]);
});

test.each([HEAVY_ROOMS_FULL_MESSAGE, HEAVY_ROOMS_USER_CAP_MESSAGE])(
  'an access denial before the first sync, as the provider reports it, asks the server once and shows its sentence in the banner',
  async (sentence) => {
    const answer = { status: HttpStatus.Ok as HttpStatus };
    const fetchSpy = mockDocumentApi({
      opened: openedAs(DocumentRole.Owner),
      currentOpenStatus: () => answer.status,
      openBody: { error: sentence },
    });
    const openRequestCount = () => fetchSpy.mock.calls.filter(([input]) => input === OPEN_PATH).length;
    renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
    await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
    const payload = { code: 'collaboration-access-denied', collaborationReason: 'access-denied', error: new Error('denied'), editor: null };
    answer.status = HttpStatus.ServiceUnavailable;
    const requestsBefore = openRequestCount();
    act(() => constructedConfig().onException(payload));
    const banner = await screen.findByTestId('connection-banner');
    await waitFor(() => expect(banner).toHaveTextContent(sentence));
    expect(openRequestCount() - requestsBefore).toBe(1);
  },
);

test('an access-denied exception before the editor is ready shows the editor failure notice, and the removed access line once the server confirms no refusal', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const payload = { code: 'collaboration-access-denied', collaborationReason: 'access-denied', error: new Error('denied'), editor: null };
  act(() => constructedConfig().onException(payload));
  expect(await screen.findByText(EDITOR_FAILED_MESSAGE)).toBeInTheDocument();
  expect(await screen.findByTestId('connection-banner')).toHaveTextContent(FAILURE_REASON_COPY[ConnectionFailureReason.AccessDenied]);
});

test('a refused upgrade reported as an exception before the editor is ready shows the editor failure notice', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const payload = {
    code: 'collaboration-connection-failed',
    collaborationReason: 'connection-failed',
    error: new Error('refused'),
    editor: null,
  };
  act(() => constructedConfig().onException(payload));
  expect(await screen.findByText(EDITOR_FAILED_MESSAGE)).toBeInTheDocument();
});

test('Reload remounts the editor with the refetched join setup and the current file', async () => {
  await reloadAfterFailure();
  expect(superDocDestroy).toHaveBeenCalledTimes(1);
  expect(SuperDoc.mock.calls[1]![0]).toEqual(
    expect.objectContaining({
      documents: [expect.objectContaining({ v2Collaboration: expect.objectContaining({ roomMode: RoomMode.Join }) })],
    }),
  );
  expect(screen.queryByTestId('connection-banner')).not.toBeInTheDocument();
  expect(screen.getByTestId('document-editor')).not.toHaveAttribute('inert');
});

test('a callback from the first instance after Reload shows no banner', async () => {
  const firstInstanceConfig = await reloadAfterFailure();
  act(() => firstInstanceConfig.onCollaborationConnectionChange(LOST_CALLBACK));
  act(() => firstInstanceConfig.onException(warnDiagnostic()));
  expect(screen.queryByTestId('connection-banner')).not.toBeInTheDocument();
});

test('Reload refetches only the open query and the file query, each exactly', async () => {
  mockDocumentApi({
    opened: openedAs(DocumentRole.Owner, RoomMode.Create),
    openedAfterReload: openedAs(DocumentRole.Owner, RoomMode.Join),
  });
  const { queryClient } = renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  act(() => constructedConfig().onCollaborationConnectionChange(SYNCED_CALLBACK));
  act(() => constructedConfig().onCollaborationConnectionChange(FAILED_CALLBACK));
  const reloadButton = await screen.findByRole('button', { name: RELOAD_LABEL });
  const refetchQueries = vi.spyOn(queryClient, 'refetchQueries');
  await userEvent.click(reloadButton);
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(2));
  expect(refetchQueries.mock.calls.map(([filters]) => filters)).toEqual([
    { queryKey: openedDocumentQueryKey(DOCUMENT_ID), exact: true },
    { queryKey: documentFileQueryKey({ documentId: DOCUMENT_ID, roomMode: RoomMode.Create }), exact: true },
  ]);
});

test('Reload disables its button while the refetch runs and remounts once', async () => {
  let releaseReload = (): void => undefined;
  const reloadGate = new Promise<void>((resolve) => {
    releaseReload = resolve;
  });
  mockDocumentApi({
    opened: openedAs(DocumentRole.Owner, RoomMode.Create),
    openedAfterReload: openedAs(DocumentRole.Owner, RoomMode.Join),
    reloadGate,
  });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  act(() => constructedConfig().onCollaborationConnectionChange(SYNCED_CALLBACK));
  act(() => constructedConfig().onCollaborationConnectionChange(FAILED_CALLBACK));
  await userEvent.click(await screen.findByRole('button', { name: RELOAD_LABEL }));
  expect(await screen.findByRole('button', { name: RELOADING_LABEL })).toBeDisabled();
  releaseReload();
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(2));
  expect(superDocDestroy).toHaveBeenCalledTimes(1);
});

const RELOAD_FILE_FAILURES = [
  { name: 'a 401', failure: () => new Response(null, { status: HttpStatus.Unauthorized }) },
  {
    name: 'a network error',
    failure: (): Response => {
      throw new TypeError('Failed to fetch');
    },
  },
];

test.each(RELOAD_FILE_FAILURES)(
  'Reload while the server is unreachable and the file fails with $name keeps the page with one error',
  async ({ failure }) => {
    mockDocumentApi({
      opened: openedAs(DocumentRole.Owner, RoomMode.Create),
      isReloadUnreachable: true,
      reloadFileResponse: failure,
    });
    renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
    await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
    act(() => constructedConfig().onCollaborationConnectionChange(SYNCED_CALLBACK));
    act(() => constructedConfig().onCollaborationConnectionChange(FAILED_CALLBACK));
    await userEvent.click(await screen.findByRole('button', { name: RELOAD_LABEL }));
    expect(await screen.findByText(RELOAD_FAILED_MESSAGE)).toBeInTheDocument();
    expect(screen.getByTestId('connection-banner')).toHaveAttribute('data-state', ConnectionState.Failed);
    expect(screen.getByRole('button', { name: RELOAD_LABEL })).toBeEnabled();
    expect(screen.getByTestId('document-editor')).toHaveAttribute('inert');
    expect(screen.queryByText(DOCUMENT_LOAD_ERROR_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
    expect(SuperDoc).toHaveBeenCalledTimes(1);
  },
);

test(
  'a Reload answered with a Queued bootstrap shows the waiting page, which enters once Ready',
  async () => {
    let stage = BootstrapStage.Ready;
    mockDocumentApi({ opened: openedAs(DocumentRole.Owner, RoomMode.Join), bootstrapStage: () => stage });
    renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
    await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
    act(() => constructedConfig().onCollaborationConnectionChange(SYNCED_CALLBACK));
    act(() => constructedConfig().onCollaborationConnectionChange(FAILED_CALLBACK));
    stage = BootstrapStage.Queued;
    await userEvent.click(await screen.findByRole('button', { name: RELOAD_LABEL }));
    expect(await screen.findByText(PREPARING_DOCUMENT_MESSAGE, {}, { timeout: PROGRESS_WAIT_MS })).toBeInTheDocument();
    expect(screen.queryByText(RELOAD_FAILED_MESSAGE)).not.toBeInTheDocument();
    stage = BootstrapStage.Ready;
    await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(2), { timeout: READY_WAIT_MS });
    expect(screen.queryByTestId('connection-banner')).not.toBeInTheDocument();
  },
  TEST_TIMEOUT_MS,
);

test('an ended session names its reason and sends the author to sign in with the way back', async () => {
  let membersStatus = HttpStatus.Ok;
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner), currentMembersStatus: () => membersStatus });
  const { queryClient, router } = renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  membersStatus = HttpStatus.Unauthorized;
  await act(() => queryClient.invalidateQueries({ queryKey: membersQueryKey(DOCUMENT_ID) }));
  act(() => constructedConfig().onCollaborationConnectionChange(SYNCED_CALLBACK));
  act(() => constructedConfig().onCollaborationConnectionChange(FAILED_CALLBACK));
  expect(await screen.findByRole('alert')).toHaveTextContent(FAILURE_REASON_COPY[ConnectionFailureReason.SessionEnded]);
  expect(screen.queryByRole('button', { name: RELOAD_LABEL })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: SIGN_IN_LABEL }));
  await waitFor(() => expect(router.state.location.pathname).toBe(AppRoute.SignIn));
  expect(router.state.location.search).toBe(`?next=${encodeURIComponent(documentPagePath(DOCUMENT_ID))}`);
});

function ownerCreate(): OpenedDocument {
  return openedAs(DocumentRole.Owner, RoomMode.Create);
}

async function renderWithTimelineContributor(opened: OpenedDocument) {
  matchMediaAlwaysMatching();
  const fetchSpy = mockDocumentApi({ opened, timeline: TIMELINE_WITH_CONTRIBUTOR });
  const rendered = renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await userEvent.click(await screen.findByRole('button', { name: TIMELINE_TOGGLE_LABEL }));
  await screen.findByTitle(CONTRIBUTOR_NAME);
  return { ...rendered, fetchSpy };
}

test('leaving a page with the timeline mounted removes the opened document from the cache', async () => {
  const { queryClient } = await renderWithTimelineContributor(ownerCreate());
  cleanup();
  await waitFor(() =>
    expect(queryClient.getQueryCache().find({ queryKey: openedDocumentQueryKey(DOCUMENT_ID), exact: true })).toBeUndefined(),
  );
});

test('with the timeline mounted the members are requested once per interval', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const { fetchSpy } = await renderWithTimelineContributor(ownerCreate());
    function membersRequests(): number {
      return fetchSpy.mock.calls.filter(([input]) => String(input).startsWith(MEMBERS_PATH)).length;
    }
    await vi.advanceTimersByTimeAsync(MEMBERS_REFRESH_MS * 2);
    const requestsBefore = membersRequests();
    await vi.advanceTimersByTimeAsync(MEMBERS_REFRESH_MS * 2);
    expect(membersRequests() - requestsBefore).toBe(2);
  } finally {
    vi.useRealTimers();
  }
});

function stubSuperDocStillLoading(): () => void {
  const original = SuperDoc.getMockImplementation();
  if (!original) throw new Error('the SuperDoc stub has no implementation to restore');
  SuperDoc.mockImplementation(function SuperDocLoadingStub() {
    return { destroy: superDocDestroy, export: superDocExport, on: vi.fn(), off: vi.fn() };
  } as unknown as typeof SuperDoc);
  return () => SuperDoc.mockImplementation(original);
}

test('a document that is still loading shows the loading line', async () => {
  const restoreSuperDoc = stubSuperDocStillLoading();
  try {
    mockDocumentApi({ opened: ownerCreate() });
    renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
    await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
    expect(screen.getByText(LOADING_DOCUMENT_MESSAGE)).toBeInTheDocument();
  } finally {
    restoreSuperDoc();
  }
});

const BEFORE_UNLOAD = 'beforeunload';
const UNSYNCED_TITLE_DRAFT = 'Unsaved draft';

function isExitPrevented(): boolean {
  const event = new Event(BEFORE_UNLOAD, { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

let router: ReturnType<typeof renderWithProviders>['router'];

async function openAsWhileLost(role: DocumentRole): Promise<SuperDocConfig> {
  mockDocumentApi({ opened: openedAs(role), isCurrentUserOnline: () => false });
  ({ router } = renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) }));
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const config = constructedConfig();
  act(() => config.onCollaborationConnectionChange(SYNCED_CALLBACK));
  act(() => config.onCollaborationConnectionChange(LOST_CALLBACK));
  await screen.findByTestId('connection-banner');
  return config;
}

test('an edit made while the connection is lost blocks leaving and Stay keeps the editor', async () => {
  const config = await openAsWhileLost(DocumentRole.Owner);
  expect(isExitPrevented()).toBe(false);
  act(() => config.onEditorUpdate());
  expect(isExitPrevented()).toBe(true);
  await userEvent.click(await screen.findByRole('link', { name: HOME_LINK_LABEL }));
  expect(await screen.findByRole('alertdialog', { name: EXIT_CONFIRMATION_TITLE })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: STAY_LABEL }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(screen.getByTestId('document-editor')).toBeInTheDocument();
});

test('the dialog Download exports the document', async () => {
  const config = await openAsWhileLost(DocumentRole.Owner);
  act(() => config.onEditorUpdate());
  await userEvent.click(await screen.findByRole('link', { name: HOME_LINK_LABEL }));
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('button', { name: DOWNLOAD_BUTTON_LABEL }));
  expect(superDocExport).toHaveBeenCalledWith({ exportedName: DOCUMENT_TITLE, triggerDownload: true });
});

test('a synced report releases the exit prevention', async () => {
  const config = await openAsWhileLost(DocumentRole.Owner);
  act(() => config.onEditorUpdate());
  act(() => config.onCollaborationConnectionChange({ state: 'synced', kind: 'recovered' }));
  expect(isExitPrevented()).toBe(false);
});

test('an edit while online does not block leaving', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  act(() => constructedConfig().onCollaborationConnectionChange(SYNCED_CALLBACK));
  act(() => constructedConfig().onEditorUpdate());
  expect(isExitPrevented()).toBe(false);
});

test('a reader never blocks leaving', async () => {
  const config = await openAsWhileLost(DocumentRole.Reader);
  act(() => config.onEditorUpdate());
  expect(isExitPrevented()).toBe(false);
});

test('a changed title blocks leaving until the edit is cancelled', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await userEvent.click(await screen.findByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) }));
  await userEvent.keyboard(UNSYNCED_TITLE_DRAFT);
  expect(isExitPrevented()).toBe(true);
  await userEvent.click(await screen.findByRole('link', { name: HOME_LINK_LABEL }));
  expect(await screen.findByRole('alertdialog', { name: EXIT_CONFIRMATION_TITLE })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: STAY_LABEL }));
  await userEvent.click(screen.getByRole('button', { name: CANCEL_TITLE_LABEL }));
  expect(isExitPrevented()).toBe(false);
});

test('a layout pass while the connection is lost does not block leaving', async () => {
  const config = await openAsWhileLost(DocumentRole.Owner);
  act(() => config.onPaginationUpdate({ totalPages: 1 }));
  expect(isExitPrevented()).toBe(false);
});

test('the page publishes the unsynced state for the sign-out menu and clears it on unmount', async () => {
  const config = await openAsWhileLost(DocumentRole.Owner);
  expect(getUnsyncedEditsSnapshot().isUnsynced).toBe(false);
  act(() => config.onEditorUpdate());
  expect(getUnsyncedEditsSnapshot().isUnsynced).toBe(true);
  cleanup();
  expect(getUnsyncedEditsSnapshot().isUnsynced).toBe(false);
});

test('deleting the document navigates to the list with no prompt even while the connection is lost', async () => {
  const config = await openAsWhileLost(DocumentRole.Owner);
  act(() => config.onEditorUpdate());
  expect(isExitPrevented()).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  await userEvent.click(await screen.findByRole('menuitem', { name: DELETE_LABEL }));
  await userEvent.click(await screen.findByRole('button', { name: DELETE_CONFIRM_LABEL }));
  await waitFor(() => expect(router.state.location.pathname).toBe(AppRoute.Documents));
  expect(screen.queryByRole('alertdialog', { name: EXIT_CONFIRMATION_TITLE })).toBeNull();
});

const PROGRESS_TEST_ID = 'open-progress';
const PAINT_MARGIN_MS = 100;
const PROGRESS_WAIT_MS = OPEN_PROGRESS_DELAY_MS + 1000;
const EDITOR_TEST_ID = 'document-editor';

function paintFirstParagraph(): void {
  const page = document.createElement('div');
  page.className = 'superdoc-page';
  const fragment = document.createElement('div');
  fragment.className = 'superdoc-fragment';
  page.append(fragment);
  act(() => screen.getByTestId(EDITOR_TEST_ID).append(page));
}

test('a Preparing bootstrap shows the Preparing panel after the delay and never builds the editor', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Reader), bootstrapStage: () => BootstrapStage.Preparing });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  const panel = await screen.findByTestId(PROGRESS_TEST_ID, {}, { timeout: PROGRESS_WAIT_MS });
  expect(panel).toHaveAttribute('data-stage', OpenStage.Preparing);
  expect(SuperDoc).not.toHaveBeenCalled();
});

test('a Failed bootstrap shows the error card instead of a panel', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Reader), bootstrapStage: () => BootstrapStage.Failed });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  expect(await screen.findByText(PREPARATION_FAILED_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByTestId(PROGRESS_TEST_ID)).not.toBeInTheDocument();
});

test('the editor shows the download, then the rendering with the pages so far, and the panel leaves at the first paragraph', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner, RoomMode.Join) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  const panel = await screen.findByTestId(PROGRESS_TEST_ID, {}, { timeout: PROGRESS_WAIT_MS });
  expect(panel).toHaveAttribute('data-stage', OpenStage.Downloading);
  act(() => constructedConfig().onCollaborationReady());
  await waitFor(() => expect(panel).toHaveAttribute('data-stage', OpenStage.Rendering));
  act(() => constructedConfig().onPaginationUpdate({ totalPages: 7 }));
  await waitFor(() => expect(panel).toHaveTextContent(pagesSoFarDetail(7)));
  paintFirstParagraph();
  await waitFor(() => expect(screen.queryByTestId(PROGRESS_TEST_ID)).not.toBeInTheDocument());
});

test('a document painted before the delay never shows the panel', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner, RoomMode.Join) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  paintFirstParagraph();
  await new Promise((resolve) => setTimeout(resolve, OPEN_PROGRESS_DELAY_MS + PAINT_MARGIN_MS));
  expect(screen.queryByTestId(PROGRESS_TEST_ID)).not.toBeInTheDocument();
});

test('before the delay SuperDoc keeps its own loading overlay and the panel then takes over', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner, RoomMode.Join) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  expect(screen.queryByTestId(PROGRESS_TEST_ID)).not.toBeInTheDocument();
  expect(screen.getByTestId('editor-surface')).not.toHaveClass(HIDDEN_LOADING_OVERLAY_CLASS);
  await screen.findByTestId(PROGRESS_TEST_ID, {}, { timeout: PROGRESS_WAIT_MS });
  expect(screen.getByTestId('editor-surface')).toHaveClass(HIDDEN_LOADING_OVERLAY_CLASS);
});

test('the editor panel offers Back to documents and Escape takes it', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner, RoomMode.Join) });
  const { router } = renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  const panel = await screen.findByTestId(PROGRESS_TEST_ID, {}, { timeout: PROGRESS_WAIT_MS });
  expect(within(panel).getByRole('link', { name: BACK_TO_DOCUMENTS_LABEL })).toHaveAttribute('href', '/documents');
  await userEvent.keyboard('{Escape}');
  expect(router.state.location.pathname).toBe('/documents');
});

test('a failed connection hides the panel so the banner is not covered', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner, RoomMode.Join) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await screen.findByTestId(PROGRESS_TEST_ID, {}, { timeout: PROGRESS_WAIT_MS });
  act(() => constructedConfig().onCollaborationConnectionChange(SYNCED_CALLBACK));
  act(() => constructedConfig().onCollaborationConnectionChange(FAILED_CALLBACK));
  await waitFor(() => expect(screen.queryByTestId(PROGRESS_TEST_ID)).not.toBeInTheDocument());
});

type OpenedConfig = { documentMode: string; documents: { data: Blob; v2Collaboration?: unknown }[] };

function configOfCall(index: number): OpenedConfig {
  return SuperDoc.mock.calls[index]![0] as unknown as OpenedConfig;
}

test('while the shared copy is being prepared the uploader reads the kept file as a read-only preview', async () => {
  const file = new File([new Uint8Array([1, 2, 3])], 'plan.docx');
  keepLocalFile({ documentId: DOCUMENT_ID, file });
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner, RoomMode.Join), bootstrapStage: () => BootstrapStage.Preparing });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  expect(await screen.findByTestId('local-preview')).toBeInTheDocument();
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const preview = configOfCall(0);
  expect([preview.documentMode, preview.documents[0]!.data, preview.documents[0]!.v2Collaboration]).toEqual([
    DocumentMode.Viewing,
    file,
    undefined,
  ]);
});

test(
  'when the answer turns Ready the live editor replaces the preview in place and the kept file is dropped',
  async () => {
    let isBootstrapped = false;
    keepLocalFile({ documentId: DOCUMENT_ID, file: new File([new Uint8Array([1, 2, 3])], 'plan.docx') });
    mockDocumentApi({
      opened: openedAs(DocumentRole.Owner, RoomMode.Join),
      bootstrapStage: () => (isBootstrapped ? BootstrapStage.Ready : BootstrapStage.Preparing),
    });
    renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
    await screen.findByTestId('local-preview');
    isBootstrapped = true;
    await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(2), { timeout: READY_WAIT_MS });
    expect(configOfCall(1).documents[0]!.v2Collaboration).toBeDefined();
    expect(superDocDestroy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('local-preview')).toBeInTheDocument();
    const panel = await screen.findByTestId(PROGRESS_TEST_ID, {}, { timeout: PROGRESS_WAIT_MS });
    expect(screen.getAllByTestId(PROGRESS_TEST_ID)).toHaveLength(1);
    expect(panel).toHaveAttribute('data-stage', OpenStage.Downloading);
    paintFirstParagraph();
    await waitFor(() => expect(screen.queryByTestId('local-preview')).not.toBeInTheDocument());
    expect(superDocDestroy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId(PROGRESS_TEST_ID)).not.toBeInTheDocument();
    expect(localFileOf(DOCUMENT_ID)).toBeNull();
  },
  TEST_TIMEOUT_MS,
);

test('a document with no kept file waits without a preview', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner, RoomMode.Join), bootstrapStage: () => BootstrapStage.Preparing });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await screen.findByTestId('waiting-title-skeleton');
  expect(screen.queryByTestId('local-preview')).not.toBeInTheDocument();
  expect(SuperDoc).not.toHaveBeenCalled();
});

const DEVICE_OWNER_NAME = 'Ada';
const DEVICE_ESTIMATE_MS = 50_000;

function openedOnDevice(): OpenedDocument {
  return { ...openedAs(DocumentRole.Owner, RoomMode.Create), preparedOnDeviceOf: DEVICE_OWNER_NAME };
}

test('a phone opened on a device job as its creator is refused with the reason and Back, and converts nothing', async () => {
  stubViewportWidth(PHONE_VIEWPORT_WIDTH);
  mockDocumentApi({ opened: openedOnDevice() });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  expect(await screen.findByText(DEVICE_REFUSAL_COPY[DeviceRefusal.NarrowViewport])).toBeInTheDocument();
  expect(screen.getByRole('link', { name: BACK_TO_DOCUMENTS_LABEL })).toHaveAttribute('href', '/documents');
  expect(SuperDoc).not.toHaveBeenCalled();
});

test('pin: a wide screen opened on a device job as its creator mounts the editor to convert', async () => {
  stubViewportWidth(WIDE_VIEWPORT_WIDTH);
  mockDocumentApi({ opened: openedOnDevice() });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(DEVICE_REFUSAL_COPY[DeviceRefusal.NarrowViewport])).not.toBeInTheDocument();
});

function giveScroll({ element, scrollHeight, scrollTop }: { element: HTMLElement; scrollHeight: number; scrollTop: number }): void {
  Object.defineProperty(element, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(element, 'clientHeight', { value: SCROLL_VIEWPORT_HEIGHT, configurable: true });
  element.scrollTop = scrollTop;
}

const SCROLL_VIEWPORT_HEIGHT = 500;

test(
  'the live editor opens where the preview was scrolled to, as a fraction of the document',
  async () => {
    keepLocalFile({ documentId: DOCUMENT_ID, file: new File([new Uint8Array([1, 2, 3])], 'plan.docx') });
    let isBootstrapped = false;
    mockDocumentApi({
      opened: openedAs(DocumentRole.Owner, RoomMode.Join),
      bootstrapStage: () => (isBootstrapped ? BootstrapStage.Ready : BootstrapStage.Preparing),
    });
    renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
    const preview = await screen.findByTestId('local-preview');
    giveScroll({ element: preview, scrollHeight: 2000, scrollTop: 750 });
    fireEvent.scroll(preview);
    isBootstrapped = true;
    await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(2), { timeout: READY_WAIT_MS });
    const live = screen.getByTestId('document-editor');
    giveScroll({ element: live, scrollHeight: 3000, scrollTop: 0 });
    paintFirstParagraph();
    await waitFor(() => expect(screen.queryByTestId('local-preview')).not.toBeInTheDocument());
    expect(live.scrollTop).toBe(1250);
  },
  TEST_TIMEOUT_MS,
);

test('the creator of a device job reads Preparing on this device with the estimate and the counter', async () => {
  stubViewportWidth(WIDE_VIEWPORT_WIDTH);
  mockDocumentApi({ opened: openedOnDevice(), estimatedMs: DEVICE_ESTIMATE_MS });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  const panel = await screen.findByTestId(PROGRESS_TEST_ID, {}, { timeout: PROGRESS_WAIT_MS });
  expect(panel).toHaveTextContent(`${PREPARING_HERE_DETAIL} · about 50 s`);
});

test('the panel of the creator of a device job stays until the collaborative editor is ready and the first paragraph is painted', async () => {
  stubViewportWidth(WIDE_VIEWPORT_WIDTH);
  mockDocumentApi({ opened: openedOnDevice() });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await screen.findByTestId(PROGRESS_TEST_ID, {}, { timeout: PROGRESS_WAIT_MS });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  paintFirstParagraph();
  await new Promise((resolve) => setTimeout(resolve, PAINT_MARGIN_MS));
  expect(screen.getByTestId(PROGRESS_TEST_ID)).toHaveTextContent(PREPARING_HERE_DETAIL);
  act(() => constructedConfig().onCollaborationReady());
  await waitFor(() => expect(screen.queryByTestId(PROGRESS_TEST_ID)).not.toBeInTheDocument());
});

test('the panel of the creator of a device job stays while the editor is synced but has painted nothing', async () => {
  stubViewportWidth(WIDE_VIEWPORT_WIDTH);
  mockDocumentApi({ opened: openedOnDevice() });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await screen.findByTestId(PROGRESS_TEST_ID, {}, { timeout: PROGRESS_WAIT_MS });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  act(() => constructedConfig().onCollaborationReady());
  await new Promise((resolve) => setTimeout(resolve, PAINT_MARGIN_MS));
  expect(screen.getByTestId(PROGRESS_TEST_ID)).toBeInTheDocument();
  paintFirstParagraph();
  await waitFor(() => expect(screen.queryByTestId(PROGRESS_TEST_ID)).not.toBeInTheDocument());
});

function collaborativeEditorConfig(): SuperDocConfig {
  const secondCall = SuperDoc.mock.calls.at(1);
  if (!secondCall) throw new Error('The collaborative editor was not constructed');
  return secondCall[0];
}

function deviceCreatorWithKeptFile(): File {
  const file = new File([new Uint8Array([1, 2, 3])], 'plan.docx');
  keepLocalFile({ documentId: DOCUMENT_ID, file });
  stubViewportWidth(WIDE_VIEWPORT_WIDTH);
  stubDeviceMemory(DEVICE_PREVIEW_MIN_MEMORY_GIGABYTES);
  mockDocumentApi({ opened: openedOnDevice(), estimatedMs: DEVICE_ESTIMATE_MS });
  return file;
}

test('the creator of a device job reads the kept file as a read-only preview while the editor converts', async () => {
  const file = deviceCreatorWithKeptFile();
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  expect(await screen.findByTestId('local-preview')).toBeInTheDocument();
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(2));
  const preview = configOfCall(0);
  expect([preview.documentMode, preview.documents[0]!.data, preview.documents[0]!.v2Collaboration]).toEqual([
    DocumentMode.Viewing,
    file,
    undefined,
  ]);
  expect(configOfCall(1).documents[0]!.v2Collaboration).toBeDefined();
  const panel = await screen.findByTestId(PROGRESS_TEST_ID, {}, { timeout: PROGRESS_WAIT_MS });
  expect(screen.getAllByTestId(PROGRESS_TEST_ID)).toHaveLength(1);
  expect(panel).toHaveTextContent(`${PREPARING_HERE_DETAIL} · about 50 s`);
  expect(superDocDestroy).not.toHaveBeenCalled();
});

test('on the device path the preview engine and its frozen pages are dropped at the first painted paragraph, and the panel stays until the editor is ready', async () => {
  deviceCreatorWithKeptFile();
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await screen.findByTestId(PROGRESS_TEST_ID, {}, { timeout: PROGRESS_WAIT_MS });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(2));
  paintFirstParagraph();
  await waitFor(() => expect(superDocDestroy).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByTestId('local-preview')).not.toBeInTheDocument());
  expect(localFileOf(DOCUMENT_ID)).toBeNull();
  expect(screen.getByTestId(PROGRESS_TEST_ID)).toHaveTextContent(PREPARING_HERE_DETAIL);
  act(() => collaborativeEditorConfig().onCollaborationReady());
  await waitFor(() => expect(screen.queryByTestId(PROGRESS_TEST_ID)).not.toBeInTheDocument());
  expect(superDocDestroy).toHaveBeenCalledTimes(1);
});

test('a device that reports less memory than the preview needs converts with no preview and drops the kept file', async () => {
  deviceCreatorWithKeptFile();
  stubDeviceMemory(DEVICE_PREVIEW_MIN_MEMORY_GIGABYTES - 1);
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const panel = await screen.findByTestId(PROGRESS_TEST_ID, {}, { timeout: PROGRESS_WAIT_MS });
  expect(panel).toHaveTextContent(PREPARING_HERE_DETAIL);
  expect(screen.queryByTestId('local-preview')).not.toBeInTheDocument();
  expect(configOfCall(0).documents[0]!.v2Collaboration).toBeDefined();
});
