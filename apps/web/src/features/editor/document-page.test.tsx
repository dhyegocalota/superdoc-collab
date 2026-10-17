import {
  ApiPath,
  DOCUMENT_NOT_READY_ERROR,
  DOCUMENT_NOT_READY_MESSAGE,
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
  type OpenedDocument,
  type SelectionSummaryView,
} from '@superdoc-collab/types';
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { pageTitle } from '@/lib/use-document-title';
import { jsonResponse } from '@/testing/json-response';
import { DOCUMENT_ID, DOCUMENT_TITLE, EDITOR_USER, openedAs, SESSION_USER } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import { timelineWith } from '@/testing/timeline-fixtures';
import {
  BACK_TO_DOCUMENTS_LABEL,
  DOCUMENT_LOAD_ERROR_MESSAGE,
  DOWNLOAD_LABEL,
  EDITOR_ESCAPE_HINT,
  EDITOR_EXIT_LABEL,
  EDITOR_FAILED_MESSAGE,
  EXPORT_FAILED_MESSAGE,
  HOME_LINK_LABEL,
  LOADING_DOCUMENT_MESSAGE,
  TITLE_LABEL,
} from './editor-copy';
import { DocumentPage } from './document-page';
import { DocumentMode } from './superdoc-options';
import { ZoomMode } from './superdoc-zoom';
import { BLANK_DOCX_PATH, membersQueryKey, openedDocumentQueryKey } from './editor-api';

const NONE_VIEW: SelectionSummaryView = { state: SelectionSummaryState.None, summary: null, failure: null, isModelAvailable: true };

type SuperDocConfig = {
  telemetry: { enabled: boolean };
  onException: (payload: { error: Error }) => void;
  zoom: { mode: string };
};

const { SuperDoc, superDocDestroy, superDocExport } = vi.hoisted(() => {
  const superDocDestroy = vi.fn();
  const superDocExport = vi.fn(() => Promise.resolve(new Blob()));
  return {
    superDocDestroy,
    superDocExport,
    SuperDoc: vi.fn(function SuperDocStub(_config: SuperDocConfig) {
      return { destroy: superDocDestroy, export: superDocExport };
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

function mockDocumentApi({
  opened,
  renamedTitle,
  openStatus = HttpStatus.Ok,
  openBody = opened,
  downloadStatus = HttpStatus.Ok,
  currentMembersStatus = () => HttpStatus.Ok,
}: {
  opened: OpenedDocument;
  renamedTitle?: string;
  openStatus?: HttpStatus;
  openBody?: unknown;
  downloadStatus?: HttpStatus;
  currentMembersStatus?: () => HttpStatus;
}) {
  let current = opened;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (input === ApiPath.Me) return jsonResponse({ body: { user: SESSION_USER } });
    if (input === MEMBERS_PATH) return jsonResponse({ body: { members: [] }, status: currentMembersStatus() });
    if (input === DOWNLOAD_PATH) return new Response(new Uint8Array([1, 2, 3]), { status: downloadStatus });
    if (input === TIMELINE_PATH) return jsonResponse({ body: EMPTY_TIMELINE });
    if (input === SUMMARIES_PATH) return jsonResponse({ body: { summaries: [] } });
    if (String(input).split('?')[0] === selectionSummaryApiPath(DOCUMENT_ID)) return jsonResponse({ body: NONE_VIEW });
    if (input === BLANK_DOCX_PATH) return new Response(new Uint8Array([1, 2, 3]));
    if (input === DOCUMENT_PATH && init?.method === HttpMethod.Patch && renamedTitle) {
      current = { ...current, document: { ...current.document, title: renamedTitle } };
      return new Response(null, { status: HttpStatus.NoContent });
    }
    if (input === DOCUMENT_PATH) return jsonResponse({ body: openStatus === HttpStatus.Ok ? current : openBody, status: openStatus });
    throw new Error(`unexpected request ${String(input)}`);
  });
}

function constructedConfig(): SuperDocConfig {
  const firstCall = SuperDoc.mock.calls.at(0);
  if (!firstCall) throw new Error('SuperDoc was not constructed');
  return firstCall[0];
}

beforeEach(() => SuperDoc.mockClear());
afterEach(() => {
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
  const title = await screen.findByRole('textbox', { name: TITLE_LABEL });
  await userEvent.clear(title);
  await userEvent.type(title, `${RENAMED_TITLE}{Enter}`);
  await screen.findByDisplayValue(RENAMED_TITLE);
  expect(SuperDoc).toHaveBeenCalledTimes(1);
  expect(superDocDestroy).not.toHaveBeenCalled();
});

test('a 409 not ready shows the owner message and never builds the editor', async () => {
  mockDocumentApi({
    opened: openedAs(DocumentRole.Reader),
    openStatus: HttpStatus.Conflict,
    openBody: { error: DOCUMENT_NOT_READY_ERROR },
  });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  expect(await screen.findByText(DOCUMENT_NOT_READY_MESSAGE)).toBeInTheDocument();
  expect(SuperDoc).not.toHaveBeenCalled();
});

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
  expect(SuperDoc).toHaveBeenCalledWith(expect.objectContaining({ documentMode: DocumentMode.Viewing, user: EDITOR_USER }));
});

test('a rejected file fetch shows the load error instead of an empty pane', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner), downloadStatus: HttpStatus.NotFound });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  expect(await screen.findByRole('alert')).toHaveTextContent(DOCUMENT_LOAD_ERROR_MESSAGE);
  expect(SuperDoc).not.toHaveBeenCalled();
});

test('an editor exception shows the editor failure', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const firstCall = SuperDoc.mock.calls.at(0);
  if (!firstCall) throw new Error('SuperDoc was not constructed');
  act(() => firstCall[0].onException({ error: new Error('boom') }));
  expect(await screen.findByRole('alert')).toHaveTextContent(EDITOR_FAILED_MESSAGE);
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
  await userEvent.click(await screen.findByRole('button', { name: DOWNLOAD_LABEL }));
  expect(superDocExport).toHaveBeenCalledTimes(1);
  expect(superDocExport).toHaveBeenCalledWith(expect.objectContaining({ triggerDownload: true }));
});

test('a failed export shows an alert instead of an unhandled rejection', async () => {
  superDocExport.mockRejectedValueOnce(new Error('export boom'));
  mockDocumentApi({ opened: openedAs(DocumentRole.Editor, RoomMode.Join) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  await userEvent.click(await screen.findByRole('button', { name: DOWNLOAD_LABEL }));
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
  expect(screen.getByRole('status')).toHaveTextContent(LOADING_DOCUMENT_MESSAGE);
});

test('the browser tab names the open document', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(document.title).toBe(pageTitle(DOCUMENT_TITLE)));
});

test('below the large breakpoint the page fits the width', async () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledWith(expect.objectContaining({ zoom: { mode: ZoomMode.FitWidth } })));
});

test('the editor never takes the focus on its own', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  expect(constructedConfig()).not.toHaveProperty('onReady');
});
