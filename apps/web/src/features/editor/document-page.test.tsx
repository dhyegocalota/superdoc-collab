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
  type OpenedDocument,
} from '@superdoc-history/types';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DOCUMENT_ID, openedAs, SESSION_USER } from '@/test/opened-document';
import { renderWithProviders } from '@/test/render-with-providers';
import { BACK_TO_DOCUMENTS_LABEL, TITLE_LABEL } from './editor-copy';
import { DocumentPage } from './document-page';
import { BLANK_DOCX_PATH } from './editor-api';

const { SuperDoc, superDocDestroy } = vi.hoisted(() => {
  const superDocDestroy = vi.fn();
  return { superDocDestroy, SuperDoc: vi.fn(function SuperDocStub() { return { destroy: superDocDestroy }; }) };
});

vi.mock('superdoc', () => ({ SuperDoc }));
vi.mock('superdoc/style.css', () => ({}));

const DOCUMENT_PATH = documentApiPath({ documentId: DOCUMENT_ID });
const DOWNLOAD_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Download });
const MEMBERS_PATH = documentApiPath({ documentId: DOCUMENT_ID, resource: DocumentResource.Members });
const RENAMED_TITLE = 'Renamed';

function mockDocumentApi({ opened, renamedTitle, openStatus = HttpStatus.Ok, openBody = opened }: { opened: OpenedDocument; renamedTitle?: string; openStatus?: HttpStatus; openBody?: unknown }) {
  let current = opened;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (input === ApiPath.Me) return new Response(JSON.stringify({ user: SESSION_USER }));
    if (input === MEMBERS_PATH) return new Response(JSON.stringify({ members: [] }));
    if (input === DOWNLOAD_PATH || input === BLANK_DOCX_PATH) return new Response(new Uint8Array([1, 2, 3]));
    if (input === DOCUMENT_PATH && init?.method === HttpMethod.Patch && renamedTitle) {
      current = { ...current, document: { ...current.document, title: renamedTitle } };
      return new Response(null, { status: HttpStatus.NoContent });
    }
    if (input === DOCUMENT_PATH) return new Response(JSON.stringify(openStatus === HttpStatus.Ok ? current : openBody), { status: openStatus });
    throw new Error(`unexpected request ${String(input)}`);
  });
}

beforeEach(() => SuperDoc.mockClear());
afterEach(() => {
  vi.restoreAllMocks();
  superDocDestroy.mockClear();
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
  mockDocumentApi({ opened: openedAs(DocumentRole.Reader), openStatus: HttpStatus.Conflict, openBody: { error: DOCUMENT_NOT_READY_ERROR } });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  expect(await screen.findByText(DOCUMENT_NOT_READY_MESSAGE)).toBeInTheDocument();
  expect(SuperDoc).not.toHaveBeenCalled();
});

test('a 404 shows the unavailable message and a link to the documents list', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Reader), openStatus: HttpStatus.NotFound, openBody: { error: DOCUMENT_UNAVAILABLE_MESSAGE } });
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
  expect(SuperDoc).toHaveBeenCalledWith(expect.objectContaining({ documentMode: 'viewing', user: SESSION_USER }));
});
