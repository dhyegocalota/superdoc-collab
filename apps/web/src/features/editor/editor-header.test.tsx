import {
  AppRoute,
  DocumentRole,
  documentApiPath,
  documentPagePath,
  HttpMethod,
  HttpStatus,
  READ_ONLY_BADGE_LABEL,
} from '@superdoc-history/types';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi, type MockInstance } from 'vitest';
import { DOCUMENT_ID, DOCUMENT_TITLE, openedAs } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  DELETE_CONFIRM_LABEL,
  DELETE_FAILED_MESSAGE,
  DELETE_LABEL,
  DOWNLOAD_LABEL,
  ONLINE_LABEL,
  RENAME_FAILED_MESSAGE,
  SHARE_LABEL,
  TITLE_LABEL,
} from './editor-copy';
import { EditorHeader } from './editor-header';

const RENAMED_TITLE = 'Renamed';
const onDownload = vi.fn();

afterEach(() => {
  vi.restoreAllMocks();
  onDownload.mockClear();
});

function requestsWithMethod(fetchSpy: MockInstance<typeof fetch>, method: HttpMethod) {
  return fetchSpy.mock.calls.filter(([, init]) => init?.method === method);
}

function onlyRequestWithMethod(fetchSpy: MockInstance<typeof fetch>, method: HttpMethod) {
  const [request, ...others] = requestsWithMethod(fetchSpy, method);
  if (!request || others.length > 0) throw new Error(`expected exactly one ${method} request`);
  const [path, init] = request;
  return { path, init };
}

test('a reader sees the read-only badge and neither Delete nor Share', () => {
  renderWithProviders(<EditorHeader opened={openedAs(DocumentRole.Reader)} members={[]} onDownload={onDownload} />);
  expect(screen.getByText(READ_ONLY_BADGE_LABEL)).toBeVisible();
  expect(screen.queryByRole('button', { name: DELETE_LABEL })).toBeNull();
  expect(screen.queryByRole('button', { name: SHARE_LABEL })).toBeNull();
  expect(screen.getByRole('heading', { name: DOCUMENT_TITLE })).toBeVisible();
});

test('an editor renames on Enter and exactly one PATCH carries the title', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.NoContent }));
  renderWithProviders(<EditorHeader opened={openedAs(DocumentRole.Editor)} members={[]} onDownload={onDownload} />);
  const title = screen.getByRole('textbox', { name: TITLE_LABEL });
  await userEvent.clear(title);
  await userEvent.type(title, `${RENAMED_TITLE}{Enter}`);
  await waitFor(() => expect(requestsWithMethod(fetchSpy, HttpMethod.Patch)).toHaveLength(1));
  const { path, init } = onlyRequestWithMethod(fetchSpy, HttpMethod.Patch);
  expect(path).toBe(documentApiPath({ documentId: DOCUMENT_ID }));
  expect(init?.body).toBe(JSON.stringify({ title: RENAMED_TITLE }));
});

test('an unchanged title sends nothing', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  renderWithProviders(<EditorHeader opened={openedAs(DocumentRole.Editor)} members={[]} onDownload={onDownload} />);
  await userEvent.type(screen.getByRole('textbox', { name: TITLE_LABEL }), '{Enter}');
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('the owner deletes after confirming and returns to the documents list', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.NoContent }));
  const { router } = renderWithProviders(<EditorHeader opened={openedAs(DocumentRole.Owner)} members={[]} onDownload={onDownload} />, {
    route: documentPagePath(DOCUMENT_ID),
  });
  await userEvent.click(screen.getByRole('button', { name: DELETE_LABEL }));
  expect(fetchSpy).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: DELETE_CONFIRM_LABEL }));
  await waitFor(() => expect(router.state.location.pathname).toBe(AppRoute.Documents));
  expect(onlyRequestWithMethod(fetchSpy, HttpMethod.Delete).path).toBe(documentApiPath({ documentId: DOCUMENT_ID }));
});

test('an online member renders a dot and an offline member does not', () => {
  const members = [
    { user: { id: 'user-1', name: 'Ada' }, role: DocumentRole.Owner, online: true },
    { user: { id: 'user-2', name: 'Bruno' }, role: DocumentRole.Editor, online: false },
  ];
  renderWithProviders(<EditorHeader opened={openedAs(DocumentRole.Owner)} members={members} onDownload={onDownload} />);
  expect(screen.getAllByLabelText(ONLINE_LABEL)).toHaveLength(1);
});

test('a failed rename shows an alert', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.BadRequest }));
  renderWithProviders(<EditorHeader opened={openedAs(DocumentRole.Editor)} members={[]} onDownload={onDownload} />);
  const title = screen.getByRole('textbox', { name: TITLE_LABEL });
  await userEvent.clear(title);
  await userEvent.type(title, `${RENAMED_TITLE}{Enter}`);
  expect(await screen.findByRole('alert')).toHaveTextContent(RENAME_FAILED_MESSAGE);
});

test('a failed delete shows an alert and stays on the page', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.Forbidden }));
  const { router } = renderWithProviders(<EditorHeader opened={openedAs(DocumentRole.Owner)} members={[]} onDownload={onDownload} />, {
    route: documentPagePath(DOCUMENT_ID),
  });
  await userEvent.click(screen.getByRole('button', { name: DELETE_LABEL }));
  await userEvent.click(screen.getByRole('button', { name: DELETE_CONFIRM_LABEL }));
  expect(await screen.findByRole('alert')).toHaveTextContent(DELETE_FAILED_MESSAGE);
  expect(router.state.location.pathname).toBe(documentPagePath(DOCUMENT_ID));
});

test('the download button asks for the live export', async () => {
  renderWithProviders(<EditorHeader opened={openedAs(DocumentRole.Reader)} members={[]} onDownload={onDownload} />);
  await userEvent.click(screen.getByRole('button', { name: DOWNLOAD_LABEL }));
  expect(onDownload).toHaveBeenCalledTimes(1);
});

test('the download button is disabled until the editor is ready', () => {
  renderWithProviders(<EditorHeader opened={openedAs(DocumentRole.Reader)} members={[]} onDownload={null} />);
  expect(screen.getByRole('button', { name: DOWNLOAD_LABEL })).toBeDisabled();
});
