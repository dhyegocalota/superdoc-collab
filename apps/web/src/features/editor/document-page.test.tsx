import {
  ApiPath,
  DOCUMENT_NOT_READY_ERROR,
  DOCUMENT_READY_POLL_MS,
  DOCUMENT_UNAVAILABLE_MESSAGE,
  documentApiPath,
  documentPagePath,
  DocumentResource,
  DocumentRole,
  HttpMethod,
  HttpStatus,
  RoomMode,
  selectionSummaryApiPath,
  SelectionSummaryState,
  SummarizeOutcome,
  SummarizeStep,
  type OpenedDocument,
  type SelectionSummaryView,
} from '@superdoc-collab/types';
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PanelPosition, PANEL_POSITION_STORAGE_KEY } from '@/features/timeline/use-panel-position';
import { GROUPING_TOPICS_MESSAGE, SUMMARIZE_EDITS_LABEL } from '@/features/timeline/timeline-copy';
import { pageTitle } from '@/lib/use-document-title';
import { jsonResponse } from '@/testing/json-response';
import { installAuthorPalette, removeAuthorPalette } from '@/testing/author-palette';
import { DOCUMENT_ID, DOCUMENT_TITLE, EDITOR_USER, openedAs, SESSION_USER } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import { timelineWith } from '@/testing/timeline-fixtures';
import {
  BACK_TO_DOCUMENTS_LABEL,
  DOCUMENT_LOAD_ERROR_MESSAGE,
  DOWNLOAD_BUTTON_LABEL,
  DOWNLOAD_PDF_LABEL,
  MORE_ACTIONS_LABEL,
  EDITOR_ESCAPE_HINT,
  EDITOR_EXIT_LABEL,
  EDIT_REJECTED_MESSAGE,
  EDITOR_FAILED_MESSAGE,
  EXPORT_FAILED_MESSAGE,
  HOME_LINK_LABEL,
  LOADING_DOCUMENT_MESSAGE,
  renameTitleLabel,
} from './editor-copy';
import { DocumentPage } from './document-page';
import { SuperDocExceptionCode } from './superdoc-exceptions';
import { DocumentMode } from './superdoc-options';
import { ZoomMode } from './superdoc-zoom';
import { DOCUMENT_READY_ANNOUNCEMENT, PREPARING_DOCUMENT_MESSAGE } from './waiting-copy';
import { BLANK_DOCX_PATH, membersQueryKey, openedDocumentQueryKey } from './editor-api';

const NONE_VIEW: SelectionSummaryView = {
  state: SelectionSummaryState.None,
  summary: null,
  failure: null,
  isModelAvailable: true,
  step: SummarizeStep.Idle,
};

type SuperDocConfig = {
  telemetry: { enabled: boolean };
  onException: (payload: { code?: string; error: Error; editor: null }) => void;
  zoom: { mode: string };
  ui: { toolbar?: { container: HTMLElement } };
  onReady: (payload: { superdoc: unknown }) => void;
};

const { SuperDoc, superDocDestroy, superDocExport } = vi.hoisted(() => {
  const superDocDestroy = vi.fn();
  const superDocExport = vi.fn(() => Promise.resolve(new Blob()));
  return {
    superDocDestroy,
    superDocExport,
    SuperDoc: vi.fn(function SuperDocStub(config: SuperDocConfig) {
      const instance = { destroy: superDocDestroy, export: superDocExport };
      config.onReady({ superdoc: instance });
      return instance;
    }),
  };
});

vi.mock('superdoc', () => ({ SuperDoc }));
vi.mock('superdoc/style.css', () => ({}));

const DOCUMENT_PATH = documentApiPath({ documentId: DOCUMENT_ID });
const DOWNLOAD_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Download });
const MEMBERS_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Members });
const TIMELINE_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Timeline });
const SUMMARIES_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Summaries });
const EMPTY_TIMELINE = timelineWith({ volumes: [], names: [] });
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
}: {
  opened: OpenedDocument;
  renamedTitle?: string;
  openStatus?: HttpStatus;
  currentOpenStatus?: () => HttpStatus;
  openBody?: unknown;
  downloadStatus?: HttpStatus;
  currentMembersStatus?: () => HttpStatus;
}) {
  let current = opened;
  let summaryStep = SummarizeStep.Idle;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (input === ApiPath.Me) return jsonResponse({ body: { user: SESSION_USER } });
    if (input === MEMBERS_PATH) return jsonResponse({ body: { members: [] }, status: currentMembersStatus() });
    if (input === DOWNLOAD_PATH) return new Response(new Uint8Array([1, 2, 3]), { status: downloadStatus });
    if (String(input).split('?')[0] === TIMELINE_PATH) return jsonResponse({ body: EMPTY_TIMELINE });
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
    if (input === DOCUMENT_PATH) {
      const status = currentOpenStatus();
      return jsonResponse({ body: status === HttpStatus.Ok ? current : openBody, status });
    }
    throw new Error(`unexpected request ${String(input)}`);
  });
}

function constructedConfig(): SuperDocConfig {
  const firstCall = SuperDoc.mock.calls.at(0);
  if (!firstCall) throw new Error('SuperDoc was not constructed');
  return firstCall[0];
}

beforeEach(() => {
  localStorage.clear();
  SuperDoc.mockClear();
  installAuthorPalette();
});
afterEach(() => {
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

test('a 409 not ready shows the waiting page and never builds the editor', async () => {
  mockDocumentApi({
    opened: openedAs(DocumentRole.Reader),
    openStatus: HttpStatus.Conflict,
    openBody: { error: DOCUMENT_NOT_READY_ERROR },
  });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  expect(await screen.findByText(PREPARING_DOCUMENT_MESSAGE)).toBeInTheDocument();
  expect(SuperDoc).not.toHaveBeenCalled();
});

test(
  'a waiting page that gets a 200 on a poll announces the document is ready and mounts the editor',
  async () => {
    let isOwnerSynced = false;
    mockDocumentApi({
      opened: openedAs(DocumentRole.Reader),
      openBody: { error: DOCUMENT_NOT_READY_ERROR },
      currentOpenStatus: () => (isOwnerSynced ? HttpStatus.Ok : HttpStatus.Conflict),
    });
    renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
    await screen.findByText(PREPARING_DOCUMENT_MESSAGE);
    isOwnerSynced = true;
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
  const membersQuery = queryClient.getQueryCache().find({ queryKey: membersQueryKey(DOCUMENT_ID) });
  const refetchInterval = membersQuery?.observers[0]?.options.refetchInterval;
  if (typeof refetchInterval !== 'function' || !membersQuery) throw new Error('members polling is not a function of the query state');
  expect(refetchInterval(membersQuery)).toBe(false);
});

test('the header download exports the live document and a reader can use it', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Reader, RoomMode.Join) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  await userEvent.click(await screen.findByRole('button', { name: DOWNLOAD_BUTTON_LABEL }));
  expect(superDocExport).toHaveBeenCalledTimes(1);
  expect(superDocExport).toHaveBeenCalledWith(expect.objectContaining({ triggerDownload: true }));
});

test('a failed export shows an alert instead of an unhandled rejection', async () => {
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

test('the page fits the width at every width, capped at full size', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() =>
    expect(SuperDoc).toHaveBeenCalledWith(expect.objectContaining({ zoom: { mode: ZoomMode.FitWidth, fitWidth: { max: 100 } } })),
  );
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
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
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

test('while the editor is mounted but not ready, Download and its More actions items are described by the loading reason', async () => {
  SuperDoc.mockImplementationOnce(function SuperDocNotReadyStub() {
    return { destroy: superDocDestroy, export: superDocExport };
  });
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: DOWNLOAD_BUTTON_LABEL })).toHaveAccessibleDescription(LOADING_DOCUMENT_MESSAGE);
  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  expect(await screen.findByRole('menuitem', { name: DOWNLOAD_PDF_LABEL })).toHaveAccessibleDescription(LOADING_DOCUMENT_MESSAGE);
});
