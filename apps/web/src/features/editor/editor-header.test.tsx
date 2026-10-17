import {
  AppRoute,
  DocumentRole,
  documentApiPath,
  documentPagePath,
  HttpMethod,
  HttpStatus,
  READ_ONLY_BADGE_LABEL,
} from '@superdoc-collab/types';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi, type MockInstance } from 'vitest';
import { DOCUMENT_ID, DOCUMENT_TITLE, openedAs, SESSION_USER } from '@/testing/opened-document';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  CANCEL_LABEL,
  DELETE_CONFIRM_LABEL,
  DELETE_FAILED_MESSAGE,
  DELETE_LABEL,
  DOWNLOAD_LABEL,
  HOME_LINK_LABEL,
  memberLabel,
  MORE_ACTIONS_LABEL,
  RENAME_FAILED_MESSAGE,
  SHARE_LABEL,
  TITLE_LABEL,
} from './editor-copy';
import { EditorHeader } from './editor-header';

const RENAMED_TITLE = 'Renamed';
const onDownload = vi.fn();

async function openDeleteDialog(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  await userEvent.click(await screen.findByRole('menuitem', { name: DELETE_LABEL }));
}

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
  renderWithProviders(
    <EditorHeader opened={openedAs(DocumentRole.Reader)} members={[]} currentUserId={SESSION_USER.id} onDownload={onDownload} />,
  );
  expect(screen.getByText(READ_ONLY_BADGE_LABEL)).toBeVisible();
  expect(screen.queryByRole('button', { name: DELETE_LABEL })).toBeNull();
  expect(screen.queryByRole('button', { name: SHARE_LABEL })).toBeNull();
  expect(screen.getByRole('heading', { name: DOCUMENT_TITLE })).toBeVisible();
});

test('an editor renames on Enter and exactly one PATCH carries the title', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.NoContent }));
  renderWithProviders(
    <EditorHeader opened={openedAs(DocumentRole.Editor)} members={[]} currentUserId={SESSION_USER.id} onDownload={onDownload} />,
  );
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
  renderWithProviders(
    <EditorHeader opened={openedAs(DocumentRole.Editor)} members={[]} currentUserId={SESSION_USER.id} onDownload={onDownload} />,
  );
  await userEvent.type(screen.getByRole('textbox', { name: TITLE_LABEL }), '{Enter}');
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('the owner deletes after confirming and returns to the documents list', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.NoContent }));
  const { router } = renderWithProviders(
    <EditorHeader opened={openedAs(DocumentRole.Owner)} members={[]} currentUserId={SESSION_USER.id} onDownload={onDownload} />,
    {
      route: documentPagePath(DOCUMENT_ID),
    },
  );
  await openDeleteDialog();
  expect(fetchSpy).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: DELETE_CONFIRM_LABEL }));
  await waitFor(() => expect(router.state.location.pathname).toBe(AppRoute.Documents));
  expect(onlyRequestWithMethod(fetchSpy, HttpMethod.Delete).path).toBe(documentApiPath({ documentId: DOCUMENT_ID }));
});

test('the home link opens the documents list', async () => {
  const { router } = renderWithProviders(
    <EditorHeader opened={openedAs(DocumentRole.Editor)} members={[]} currentUserId={SESSION_USER.id} onDownload={onDownload} />,
    { route: documentPagePath(DOCUMENT_ID) },
  );
  await userEvent.click(screen.getByRole('link', { name: HOME_LINK_LABEL }));
  expect(router.state.location.pathname).toBe(AppRoute.Documents);
});

test('members announce their presence and the current user is online at once', () => {
  const members = [
    { user: { id: SESSION_USER.id, name: 'Ada' }, role: DocumentRole.Owner, online: false },
    { user: { id: 'user-2', name: 'Bruno' }, role: DocumentRole.Editor, online: false },
    { user: { id: 'user-3', name: 'Carla' }, role: DocumentRole.Editor, online: true },
  ];
  renderWithProviders(
    <EditorHeader opened={openedAs(DocumentRole.Owner)} members={members} currentUserId={SESSION_USER.id} onDownload={onDownload} />,
  );
  expect(screen.getByText(memberLabel({ name: 'Ada', isOnline: true }))).toBeInTheDocument();
  expect(screen.getByText(memberLabel({ name: 'Carla', isOnline: true }))).toBeInTheDocument();
  expect(screen.getByText(memberLabel({ name: 'Bruno', isOnline: false }))).toBeInTheDocument();
  expect(memberLabel({ name: 'Carla', isOnline: true })).toBe('Carla, online');
});

test('a failed rename shows an alert', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.BadRequest }));
  renderWithProviders(
    <EditorHeader opened={openedAs(DocumentRole.Editor)} members={[]} currentUserId={SESSION_USER.id} onDownload={onDownload} />,
  );
  const title = screen.getByRole('textbox', { name: TITLE_LABEL });
  await userEvent.clear(title);
  await userEvent.type(title, `${RENAMED_TITLE}{Enter}`);
  expect(await screen.findByRole('alert')).toHaveTextContent(RENAME_FAILED_MESSAGE);
});

test('a failed delete shows an alert and stays on the page', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.Forbidden }));
  const { router } = renderWithProviders(
    <EditorHeader opened={openedAs(DocumentRole.Owner)} members={[]} currentUserId={SESSION_USER.id} onDownload={onDownload} />,
    {
      route: documentPagePath(DOCUMENT_ID),
    },
  );
  await openDeleteDialog();
  await userEvent.click(screen.getByRole('button', { name: DELETE_CONFIRM_LABEL }));
  expect(await screen.findByRole('alert')).toHaveTextContent(DELETE_FAILED_MESSAGE);
  expect(router.state.location.pathname).toBe(documentPagePath(DOCUMENT_ID));
});

test('the download button asks for the live export', async () => {
  renderWithProviders(
    <EditorHeader opened={openedAs(DocumentRole.Reader)} members={[]} currentUserId={SESSION_USER.id} onDownload={onDownload} />,
  );
  await userEvent.click(screen.getByRole('button', { name: DOWNLOAD_LABEL }));
  expect(onDownload).toHaveBeenCalledTimes(1);
});

test('the download button is disabled until the editor is ready', () => {
  renderWithProviders(
    <EditorHeader opened={openedAs(DocumentRole.Reader)} members={[]} currentUserId={SESSION_USER.id} onDownload={undefined} />,
  );
  expect(screen.getByRole('button', { name: DOWNLOAD_LABEL })).toBeDisabled();
});

test('Delete lives in the More actions menu, Download and Share keep their names as icons', async () => {
  renderWithProviders(
    <EditorHeader opened={openedAs(DocumentRole.Owner)} members={[]} currentUserId={SESSION_USER.id} onDownload={onDownload} />,
  );
  expect(screen.queryByRole('button', { name: DELETE_LABEL })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: DOWNLOAD_LABEL })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: SHARE_LABEL })).toBeInTheDocument();
  await openDeleteDialog();
  expect(await screen.findByRole('button', { name: DELETE_CONFIRM_LABEL })).toBeInTheDocument();
});

test('a reader has no More actions menu', () => {
  renderWithProviders(
    <EditorHeader opened={openedAs(DocumentRole.Reader)} members={[]} currentUserId={SESSION_USER.id} onDownload={onDownload} />,
  );
  expect(screen.queryByRole('button', { name: MORE_ACTIONS_LABEL })).not.toBeInTheDocument();
});

test('Cancel closes the delete dialog, sends nothing and leaves the page clickable', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  renderWithProviders(
    <EditorHeader opened={openedAs(DocumentRole.Owner)} members={[]} currentUserId={SESSION_USER.id} onDownload={onDownload} />,
  );
  await openDeleteDialog();
  await userEvent.click(await screen.findByRole('button', { name: CANCEL_LABEL }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(document.body.style.pointerEvents).not.toBe('none');
  await userEvent.click(screen.getByRole('button', { name: DOWNLOAD_LABEL }));
  expect(onDownload).toHaveBeenCalledTimes(1);
});

test('closing the delete dialog returns the focus to More actions', async () => {
  renderWithProviders(
    <EditorHeader opened={openedAs(DocumentRole.Owner)} members={[]} currentUserId={SESSION_USER.id} onDownload={onDownload} />,
  );
  await openDeleteDialog();
  await userEvent.click(await screen.findByRole('button', { name: CANCEL_LABEL }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: MORE_ACTIONS_LABEL })).toHaveFocus();
});
