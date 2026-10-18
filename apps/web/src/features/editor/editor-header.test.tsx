import {
  AppRoute,
  DocumentRole,
  documentApiPath,
  documentPagePath,
  HttpMethod,
  HttpStatus,
  READ_ONLY_BADGE_LABEL,
  type DocumentMember,
} from '@superdoc-collab/types';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { SuperDoc } from 'superdoc';
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from 'vitest';
import { accountMenuLabel } from '@/features/account/account-copy';
import { SESSION_QUERY_KEY } from '@/features/auth/use-session';
import { USE_WITH_AI_LABEL, USE_WITH_AI_TITLE } from '@/features/connected-apps/connected-apps-copy';
import { UseWithAiDialog, type UseWithAiSlot } from '@/features/connected-apps/use-with-ai-dialog';
import { DOCUMENT_ID, DOCUMENT_TITLE, openedAs, SESSION_USER } from '@/testing/opened-document';
import { installAuthorPalette, removeAuthorPalette } from '@/testing/author-palette';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  CANCEL_LABEL,
  DELETE_CONFIRM_LABEL,
  DELETE_FAILED_MESSAGE,
  DELETE_LABEL,
  DOWNLOAD_BUTTON_LABEL,
  DOWNLOAD_LABEL,
  DOWNLOAD_PDF_LABEL,
  FIND_IN_DOCUMENT_LABEL,
  HOME_LINK_LABEL,
  memberLabel,
  MORE_ACTIONS_LABEL,
  renameTitleLabel,
  RENAME_FAILED_MESSAGE,
  SHARE_LABEL,
} from './editor-copy';
import { EditorHeader } from './editor-header';
import { Members } from './members';

vi.mock('./members', async (importOriginal) => {
  const original = await importOriginal<typeof import('./members')>();
  return { Members: vi.fn(original.Members) };
});

const RENAMED_TITLE = 'Renamed';
const ADA: DocumentMember = { user: { id: SESSION_USER.id, name: 'Ada' }, role: DocumentRole.Owner, online: true };
const onDownloadDocx = vi.fn();

function renderUseWithAi(slot?: UseWithAiSlot): ReactNode {
  return <UseWithAiDialog title={DOCUMENT_TITLE} canEdit {...slot} />;
}

type HeaderOptions = {
  role?: DocumentRole;
  members?: DocumentMember[];
  superdoc?: SuperDoc | null;
  isPastVersion?: boolean;
  route?: string;
  width?: number;
};

const WIDE_VIEWPORT_WIDTH = 1280;
const NARROW_VIEWPORT_WIDTH = 768;

function stubViewportWidth(width: number): void {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const minimumWidth = Number(/min-width:\s*(\d+)px/.exec(query)?.[1]);
    return {
      matches: width >= minimumWidth,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
  });
}

function renderHeader({
  role = DocumentRole.Editor,
  members = [],
  superdoc = null,
  isPastVersion = false,
  route,
  width = WIDE_VIEWPORT_WIDTH,
}: HeaderOptions = {}) {
  stubViewportWidth(width);
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  queryClient.setQueryData(SESSION_QUERY_KEY, SESSION_USER);
  return renderWithProviders(
    <EditorHeader
      opened={openedAs(role)}
      members={members}
      currentUserId={SESSION_USER.id}
      superdoc={superdoc}
      editorContainer={null}
      isPastVersion={isPastVersion}
      onDownloadDocx={onDownloadDocx}
      renderUseWithAi={renderUseWithAi}
    />,
    { queryClient, route },
  );
}

async function renameTo(title: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) }));
  await userEvent.keyboard(`${title}{Enter}`);
}

async function openDeleteDialog(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  await userEvent.click(await screen.findByRole('menuitem', { name: DELETE_LABEL }));
}

beforeEach(() => {
  installAuthorPalette();
});

afterEach(() => {
  removeAuthorPalette();
  vi.restoreAllMocks();
  vi.mocked(Members).mockClear();
  onDownloadDocx.mockClear();
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

test('at 1280 the right slot order is Members, Find, Use with AI, Share, Download, More actions, account', () => {
  renderHeader({ role: DocumentRole.Owner, members: [ADA] });
  const controls: Record<string, HTMLElement> = {
    Members: screen.getByRole('button', { name: memberLabel({ name: ADA.user.name, isOnline: true }) }),
    Find: screen.getByRole('button', { name: FIND_IN_DOCUMENT_LABEL }),
    'Use with AI': screen.getByRole('button', { name: USE_WITH_AI_LABEL }),
    Share: screen.getByRole('button', { name: SHARE_LABEL }),
    Download: screen.getByRole('button', { name: DOWNLOAD_BUTTON_LABEL }),
    'More actions': screen.getByRole('button', { name: MORE_ACTIONS_LABEL }),
    Account: screen.getByRole('button', { name: accountMenuLabel(SESSION_USER.name) }),
  };
  const labelsInDocumentOrder = Object.entries(controls)
    .sort(([, first], [, second]) => (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map(([label]) => label);
  expect(labelsInDocumentOrder).toEqual(['Members', 'Find', 'Use with AI', 'Share', 'Download', 'More actions', 'Account']);
});

test('closing Use with AI opened from More actions returns focus to the More actions button', async () => {
  renderHeader({ width: NARROW_VIEWPORT_WIDTH });
  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  await userEvent.click(await screen.findByRole('menuitem', { name: USE_WITH_AI_LABEL }));
  expect(await screen.findByRole('dialog', { name: USE_WITH_AI_TITLE })).toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: MORE_ACTIONS_LABEL })).toHaveFocus();
});

test('EditorHeader passes superdoc and isPastVersion to Members', () => {
  const superdoc = {} as SuperDoc;
  renderHeader({ members: [ADA], superdoc, isPastVersion: true });
  expect(vi.mocked(Members)).toHaveBeenCalledWith(expect.objectContaining({ superdoc, isPastVersion: true, members: [ADA] }), undefined);
});

test('a reader sees the read-only badge, an h1 title and neither Delete nor Share', async () => {
  renderHeader({ role: DocumentRole.Reader, width: NARROW_VIEWPORT_WIDTH });
  expect(screen.getByText(READ_ONLY_BADGE_LABEL)).toBeVisible();
  expect(screen.queryByRole('button', { name: SHARE_LABEL })).toBeNull();
  expect(screen.getByRole('heading', { level: 1, name: DOCUMENT_TITLE })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  expect(await screen.findByRole('menuitem', { name: DOWNLOAD_PDF_LABEL })).toBeVisible();
  expect(screen.queryByRole('menuitem', { name: DELETE_LABEL })).toBeNull();
});

test('an editor renames on Enter and exactly one PATCH carries the title', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.NoContent }));
  renderHeader();
  await renameTo(RENAMED_TITLE);
  await waitFor(() => expect(requestsWithMethod(fetchSpy, HttpMethod.Patch)).toHaveLength(1));
  const { path, init } = onlyRequestWithMethod(fetchSpy, HttpMethod.Patch);
  expect(path).toBe(documentApiPath({ documentId: DOCUMENT_ID }));
  expect(init?.body).toBe(JSON.stringify({ title: RENAMED_TITLE }));
});

test('an unchanged title sends nothing', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  renderHeader();
  await renameTo('');
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('a failed rename shows an alert', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.BadRequest }));
  renderHeader();
  await renameTo(RENAMED_TITLE);
  expect(await screen.findByRole('alert')).toHaveTextContent(RENAME_FAILED_MESSAGE);
  expect(within(screen.getByRole('banner')).queryByRole('alert')).toBeNull();
});

test('the owner deletes after confirming and returns to the documents list', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.NoContent }));
  const { router } = renderHeader({ role: DocumentRole.Owner, route: documentPagePath(DOCUMENT_ID) });
  await openDeleteDialog();
  expect(fetchSpy).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: DELETE_CONFIRM_LABEL }));
  await waitFor(() => expect(router.state.location.pathname).toBe(AppRoute.Documents));
  expect(onlyRequestWithMethod(fetchSpy, HttpMethod.Delete).path).toBe(documentApiPath({ documentId: DOCUMENT_ID }));
});

test('a failed delete shows an alert and stays on the page', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.Forbidden }));
  const { router } = renderHeader({ role: DocumentRole.Owner, route: documentPagePath(DOCUMENT_ID) });
  await openDeleteDialog();
  await userEvent.click(screen.getByRole('button', { name: DELETE_CONFIRM_LABEL }));
  expect(await screen.findByRole('alert')).toHaveTextContent(DELETE_FAILED_MESSAGE);
  expect(router.state.location.pathname).toBe(documentPagePath(DOCUMENT_ID));
});

test('the brand link opens the documents list', async () => {
  const { router } = renderHeader({ route: documentPagePath(DOCUMENT_ID) });
  await userEvent.click(screen.getByRole('link', { name: HOME_LINK_LABEL }));
  expect(router.state.location.pathname).toBe(AppRoute.Documents);
});

test('the main download part asks for the live DOCX export', async () => {
  renderHeader({ role: DocumentRole.Reader, superdoc: {} as SuperDoc });
  await userEvent.click(screen.getByRole('button', { name: DOWNLOAD_BUTTON_LABEL }));
  expect(onDownloadDocx).toHaveBeenCalledTimes(1);
});

test('the download parts are disabled until the editor is ready', () => {
  renderHeader({ role: DocumentRole.Reader, superdoc: null });
  expect(screen.getByRole('button', { name: DOWNLOAD_BUTTON_LABEL })).toBeDisabled();
});

test('More actions offers Download .docx too, and Delete only to the owner', async () => {
  renderHeader({ role: DocumentRole.Owner, superdoc: {} as SuperDoc, width: NARROW_VIEWPORT_WIDTH });
  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  await userEvent.click(await screen.findByRole('menuitem', { name: DOWNLOAD_LABEL }));
  expect(onDownloadDocx).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  expect(await screen.findByRole('menuitem', { name: DELETE_LABEL })).toBeVisible();
});

test('Cancel closes the delete dialog, sends nothing and leaves the page clickable', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  renderHeader({ role: DocumentRole.Owner, superdoc: {} as SuperDoc });
  await openDeleteDialog();
  await userEvent.click(await screen.findByRole('button', { name: CANCEL_LABEL }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(document.body.style.pointerEvents).not.toBe('none');
  await userEvent.click(screen.getByRole('button', { name: DOWNLOAD_BUTTON_LABEL }));
  expect(onDownloadDocx).toHaveBeenCalledTimes(1);
});

test('closing the delete dialog returns the focus to More actions', async () => {
  renderHeader({ role: DocumentRole.Owner });
  await openDeleteDialog();
  await userEvent.click(await screen.findByRole('button', { name: CANCEL_LABEL }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: MORE_ACTIONS_LABEL })).toHaveFocus();
});

test('members announce their presence and the current user is online at once', () => {
  const members: DocumentMember[] = [
    { user: { id: SESSION_USER.id, name: 'Ada' }, role: DocumentRole.Owner, online: false },
    { user: { id: 'user-2', name: 'Bruno' }, role: DocumentRole.Editor, online: false },
    { user: { id: 'user-3', name: 'Carla' }, role: DocumentRole.Editor, online: true },
  ];
  renderHeader({ role: DocumentRole.Owner, members });
  expect(screen.getByRole('button', { name: memberLabel({ name: 'Ada', isOnline: true }) })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: memberLabel({ name: 'Carla', isOnline: true }) })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: memberLabel({ name: 'Bruno', isOnline: false }) })).toBeInTheDocument();
});

test('at 768 the bar keeps Members, Share, More actions and the account, and More actions carries Find, Use with AI and both downloads', async () => {
  const emit = vi.fn();
  renderHeader({ role: DocumentRole.Owner, members: [ADA], superdoc: { emit } as unknown as SuperDoc, width: NARROW_VIEWPORT_WIDTH });
  expect(screen.getByRole('button', { name: memberLabel({ name: ADA.user.name, isOnline: true }) })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: SHARE_LABEL })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: accountMenuLabel(SESSION_USER.name) })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: USE_WITH_AI_LABEL })).toBeNull();
  expect(screen.queryByRole('button', { name: DOWNLOAD_BUTTON_LABEL })).toBeNull();
  expect(screen.queryByRole('button', { name: FIND_IN_DOCUMENT_LABEL })).toBeNull();

  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  expect(await screen.findByRole('menuitem', { name: USE_WITH_AI_LABEL })).toBeVisible();
  expect(screen.getByRole('menuitem', { name: DOWNLOAD_LABEL })).toBeVisible();
  expect(screen.getByRole('menuitem', { name: DOWNLOAD_PDF_LABEL })).toBeVisible();
  await userEvent.click(screen.getByRole('menuitem', { name: FIND_IN_DOCUMENT_LABEL }));
  expect(emit).toHaveBeenCalledWith('search:open');
});

test('at 1280 the menu holds only Delete for the owner and nothing for a reader', async () => {
  renderHeader({ role: DocumentRole.Owner, superdoc: {} as SuperDoc });
  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  expect(await screen.findByRole('menuitem', { name: DELETE_LABEL })).toBeVisible();
  expect(screen.queryByRole('menuitem', { name: DOWNLOAD_PDF_LABEL })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: FIND_IN_DOCUMENT_LABEL })).toBeNull();
});
