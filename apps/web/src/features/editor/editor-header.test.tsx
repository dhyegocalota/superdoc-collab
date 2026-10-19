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
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { SuperDoc } from 'superdoc';
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from 'vitest';
import { accountMenuLabel } from '@/features/account/account-copy';
import { SESSION_QUERY_KEY } from '@/features/auth/use-session';
import { USE_WITH_AI_LABEL, USE_WITH_AI_TITLE } from '@/features/connected-apps/connected-apps-copy';
import { UseWithAiDialog, type UseWithAiSlot } from '@/features/connected-apps/use-with-ai-dialog';
import { DOCUMENT_ID, DOCUMENT_TITLE, EDITOR_COLOR_SLOT, openedAs, SESSION_USER } from '@/testing/opened-document';
import { installAuthorPalette, removeAuthorPalette } from '@/testing/author-palette';
import { NARROW_VIEWPORT_WIDTH, stubViewportWidth, WIDE_VIEWPORT_WIDTH } from '@/testing/viewport';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  CANCEL_LABEL,
  CANCEL_TITLE_LABEL,
  DELETE_CONFIRM_LABEL,
  DELETE_FAILED_MESSAGE,
  DELETE_LABEL,
  DOWNLOAD_BUTTON_LABEL,
  DOWNLOAD_LABEL,
  DOWNLOAD_OPTIONS_LABEL,
  DOWNLOAD_PDF_LABEL,
  FIND_IN_DOCUMENT_LABEL,
  HOME_LINK_LABEL,
  memberLabel,
  onlineMembersLabel,
  MORE_ACTIONS_LABEL,
  renameTitleLabel,
  RENAME_FAILED_MESSAGE,
  SHARE_LABEL,
} from './editor-copy';
import { EditorHeader } from './editor-header';
import { superdocStub } from '@/testing/superdoc-stub';
import { Members } from './members';
import { ADD_COMMENT_FAILED_MESSAGE, ADD_COMMENT_SUBMIT_LABEL, ADD_COMMENT_TITLE, COMMENT_TEXT_LABEL } from './editor-copy';
import { SHORTCUT_GROUP_LABELS, SHORTCUTS_TITLE } from '@/features/shortcuts/shortcuts-copy';
import { ShortcutGroup } from '@/features/shortcuts/shortcuts';

vi.mock('./members', async (importOriginal) => {
  const original = await importOriginal<typeof import('./members')>();
  return { Members: vi.fn(original.Members) };
});

const RENAMED_TITLE = 'Renamed';
const ADA: DocumentMember = { user: { id: SESSION_USER.id, name: 'Ada' }, role: DocumentRole.Owner, online: true, colorSlot: 1 };
const onDownloadDocx = vi.fn();
const onToggleEditsPanel = vi.fn();
const onSummarize = vi.fn();

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
      onToggleEditsPanel={onToggleEditsPanel}
      onSummarize={onSummarize}
      onTitleDirtyChange={vi.fn()}
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
    Members: screen.getByRole('button', { name: memberLabel(ADA.user.name) }),
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
  const moreActions = screen.getByRole('button', { name: MORE_ACTIONS_LABEL });
  expect(moreActions).toHaveFocus();
  expect(moreActions).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(moreActions);
  expect(await screen.findByRole('menuitem', { name: USE_WITH_AI_LABEL })).toBeInTheDocument();
  expect(moreActions).toHaveAttribute('aria-expanded', 'true');
});

test('the Use with AI dialog opened from More actions lives outside the menu', async () => {
  renderHeader({ width: NARROW_VIEWPORT_WIDTH });
  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  await userEvent.click(await screen.findByRole('menuitem', { name: USE_WITH_AI_LABEL }));
  const dialog = await screen.findByRole('dialog', { name: USE_WITH_AI_TITLE });
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  expect(dialog.closest('[role="menu"]')).toBeNull();
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

test('the download parts are disabled until the editor is ready', () => {
  renderHeader({ role: DocumentRole.Reader, superdoc: null });
  expect(screen.getByRole('button', { name: DOWNLOAD_BUTTON_LABEL })).toBeDisabled();
});

test('More actions offers Download .docx too, and Delete only to the owner', async () => {
  renderHeader({ role: DocumentRole.Owner, superdoc: superdocStub(), width: NARROW_VIEWPORT_WIDTH });
  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  await userEvent.click(await screen.findByRole('menuitem', { name: DOWNLOAD_LABEL }));
  expect(onDownloadDocx).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  expect(await screen.findByRole('menuitem', { name: DELETE_LABEL })).toBeVisible();
});

test('Cancel closes the delete dialog, sends nothing and leaves the page clickable', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  renderHeader({ role: DocumentRole.Owner, superdoc: superdocStub() });
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

test('the row shows the online members and the current user at once, and not an offline member', () => {
  const members: DocumentMember[] = [
    { user: { id: SESSION_USER.id, name: 'Ada' }, role: DocumentRole.Owner, online: false, colorSlot: 1 },
    { user: { id: 'user-2', name: 'Bruno' }, role: DocumentRole.Editor, online: false, colorSlot: 2 },
    { user: { id: 'user-3', name: 'Carla' }, role: DocumentRole.Editor, online: true, colorSlot: 3 },
  ];
  renderHeader({ role: DocumentRole.Owner, members });
  expect(screen.getByRole('button', { name: memberLabel('Ada') })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: memberLabel('Carla') })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Bruno/ })).not.toBeInTheDocument();
  expect(screen.getByRole('group', { name: onlineMembersLabel(2) })).toBeInTheDocument();
});

test('at 768 the bar keeps Members, Share, More actions and the account, and More actions carries Find, Use with AI and both downloads', async () => {
  const emit = vi.fn();
  renderHeader({ role: DocumentRole.Owner, members: [ADA], superdoc: superdocStub({ emit }), width: NARROW_VIEWPORT_WIDTH });
  expect(screen.getByRole('button', { name: memberLabel(ADA.user.name) })).toBeInTheDocument();
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

test('at 1280 the menu holds only Delete and the shortcuts row for the owner and nothing for a reader', async () => {
  renderHeader({ role: DocumentRole.Owner, superdoc: superdocStub() });
  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  expect(await screen.findByRole('menuitem', { name: DELETE_LABEL })).toBeVisible();
  expect(screen.queryByRole('menuitem', { name: DOWNLOAD_PDF_LABEL })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: FIND_IN_DOCUMENT_LABEL })).toBeNull();
});

test('the account avatar wears the colour of the document slot, like the member swatch', () => {
  renderHeader();
  expect(screen.getByRole('button', { name: accountMenuLabel(SESSION_USER.name) }).firstElementChild).toHaveClass(
    `bg-author-${EDITOR_COLOR_SLOT}`,
  );
});

function accountGroup(): HTMLElement | null {
  return screen.getByRole('button', { name: accountMenuLabel(SESSION_USER.name) }).closest('.hidden');
}

test('while the title is edited the right groups give the row to the editor below md and return on Cancel', async () => {
  renderHeader({ width: NARROW_VIEWPORT_WIDTH });
  expect(accountGroup()).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: renameTitleLabel(DOCUMENT_TITLE) }));
  expect(accountGroup()).toHaveClass('hidden', 'md:contents');
  await userEvent.click(screen.getByRole('button', { name: CANCEL_TITLE_LABEL }));
  expect(accountGroup()).toBeNull();
});

const SAVE_KEY = { code: 'KeyS', key: 's', ctrlKey: true };
const ALIGN_LEFT_KEY = { code: 'KeyL', key: 'l', ctrlKey: true };

function superdocWithAlignCommand(execute: () => void): SuperDoc {
  const handle = { getState: () => ({ enabled: true, supported: true }), execute };
  return superdocStub({ ui: { commands: { get: () => handle } } });
}

test('Ctrl+S downloads the DOCX and is consumed', () => {
  renderHeader({ superdoc: superdocStub() });
  expect(fireEvent.keyDown(document.body, SAVE_KEY)).toBe(false);
  expect(onDownloadDocx).toHaveBeenCalledTimes(1);
});

test('a formatting key runs on the instance for an editor', () => {
  const execute = vi.fn();
  renderHeader({ superdoc: superdocWithAlignCommand(execute) });
  expect(fireEvent.keyDown(document.body, ALIGN_LEFT_KEY)).toBe(false);
  expect(execute).toHaveBeenCalledWith('left');
});

test.each([
  ['a reader', { role: DocumentRole.Reader }],
  ['a past version', { isPastVersion: true }],
])('%s has no formatting keys and keeps the download key', (_, options) => {
  const execute = vi.fn();
  renderHeader({ superdoc: superdocWithAlignCommand(execute), ...options });
  expect(fireEvent.keyDown(document.body, ALIGN_LEFT_KEY)).toBe(true);
  expect(execute).not.toHaveBeenCalled();
  expect(fireEvent.keyDown(document.body, SAVE_KEY)).toBe(false);
  expect(onDownloadDocx).toHaveBeenCalledTimes(1);
});

const SHORTCUTS_KEY = { code: 'Slash', key: '/', ctrlKey: true };

function pillTexts(element: HTMLElement): (string | null)[] {
  return [...element.querySelectorAll('kbd')].map((pill) => pill.textContent);
}

test('Ctrl+/ opens the shortcuts dialog and Escape returns focus to where it was', async () => {
  renderHeader({ superdoc: superdocStub() });
  const findButton = screen.getByRole('button', { name: FIND_IN_DOCUMENT_LABEL });
  findButton.focus();
  fireEvent.keyDown(findButton, SHORTCUTS_KEY);
  expect(await screen.findByRole('dialog', { name: SHORTCUTS_TITLE })).toBeVisible();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(findButton).toHaveFocus();
});

test('a question mark outside a field opens the dialog', async () => {
  renderHeader({ superdoc: superdocStub() });
  fireEvent.keyDown(document.body, { code: 'Slash', key: '?', shiftKey: true });
  expect(await screen.findByRole('dialog', { name: SHORTCUTS_TITLE })).toBeVisible();
});

test("a reader's dialog has no formatting group", async () => {
  renderHeader({ role: DocumentRole.Reader });
  fireEvent.keyDown(document.body, SHORTCUTS_KEY);
  const dialog = await screen.findByRole('dialog', { name: SHORTCUTS_TITLE });
  expect(within(dialog).getByRole('heading', { name: SHORTCUT_GROUP_LABELS[ShortcutGroup.Document] })).toBeVisible();
  expect(within(dialog).queryByRole('heading', { name: SHORTCUT_GROUP_LABELS[ShortcutGroup.Formatting] })).toBeNull();
});

test('More actions ends with the shortcuts row, which carries its hint and opens the dialog', async () => {
  renderHeader({ role: DocumentRole.Owner, width: NARROW_VIEWPORT_WIDTH, superdoc: superdocStub() });
  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  const items = await screen.findAllByRole('menuitem');
  const lastItem = items[items.length - 1]!;
  expect(lastItem).toHaveTextContent(SHORTCUTS_TITLE);
  expect(pillTexts(lastItem)).toEqual(['Ctrl', '/']);
  await userEvent.click(lastItem);
  expect(await screen.findByRole('dialog', { name: SHORTCUTS_TITLE })).toBeVisible();
});

test('the download menu items carry the save and print hints', async () => {
  renderHeader({ superdoc: superdocStub() });
  await userEvent.click(screen.getByRole('button', { name: DOWNLOAD_OPTIONS_LABEL }));
  expect(pillTexts(await screen.findByRole('menuitem', { name: new RegExp(DOWNLOAD_LABEL) }))).toEqual(['Ctrl', 'S']);
  expect(pillTexts(screen.getByRole('menuitem', { name: new RegExp(DOWNLOAD_PDF_LABEL) }))).toEqual(['Ctrl', 'P']);
});

test('the More actions menu below lg shows the find, save and print hints', async () => {
  renderHeader({ width: NARROW_VIEWPORT_WIDTH, superdoc: superdocStub() });
  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  expect(pillTexts(await screen.findByRole('menuitem', { name: new RegExp(FIND_IN_DOCUMENT_LABEL) }))).toEqual(['Ctrl', 'F']);
  expect(pillTexts(screen.getByRole('menuitem', { name: new RegExp(DOWNLOAD_LABEL) }))).toEqual(['Ctrl', 'S']);
  expect(pillTexts(screen.getByRole('menuitem', { name: new RegExp(DOWNLOAD_PDF_LABEL) }))).toEqual(['Ctrl', 'P']);
});

test.each([
  [FIND_IN_DOCUMENT_LABEL, ['Ctrl', 'F']],
  [DOWNLOAD_BUTTON_LABEL, ['Ctrl', 'S']],
])('the %s tooltip carries its hint', async (name, keys) => {
  renderHeader({ superdoc: superdocStub() });
  await userEvent.hover(screen.getByRole('button', { name }));
  expect(pillTexts(await screen.findByRole('tooltip'))).toEqual(keys);
});

const OPTION_KEYS = { ctrlKey: true, altKey: true };
const COMMENT_KEY = { code: 'KeyM', key: 'm', ...OPTION_KEYS };
const COMMENT_TEXT = 'Check this figure';

function superdocWithComments(createFromSelection: () => unknown): SuperDoc {
  const handle = { getState: () => ({ enabled: true, supported: true }), execute: vi.fn() };
  return superdocStub({
    ui: {
      commands: { get: () => handle },
      comments: { createFromSelection },
    },
  });
}

test('Ctrl+Alt+E and Ctrl+Alt+S reach the page callbacks', () => {
  renderHeader({ superdoc: superdocStub() });
  fireEvent.keyDown(document.body, { code: 'KeyE', key: 'e', ...OPTION_KEYS });
  fireEvent.keyDown(document.body, { code: 'KeyS', key: 's', ...OPTION_KEYS });
  expect(onToggleEditsPanel).toHaveBeenCalledTimes(1);
  expect(onSummarize).toHaveBeenCalledTimes(1);
});

test('Ctrl+Alt+M opens the composer and sends the comment on the live selection', async () => {
  const createFromSelection = vi.fn().mockResolvedValue({ success: true });
  renderHeader({ superdoc: superdocWithComments(createFromSelection) });
  fireEvent.keyDown(document.body, COMMENT_KEY);
  const dialog = await screen.findByRole('dialog', { name: ADD_COMMENT_TITLE });
  await userEvent.type(within(dialog).getByRole('textbox', { name: COMMENT_TEXT_LABEL }), COMMENT_TEXT);
  await userEvent.click(within(dialog).getByRole('button', { name: ADD_COMMENT_SUBMIT_LABEL }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(createFromSelection).toHaveBeenCalledWith({ text: COMMENT_TEXT });
});

test('a rejected comment keeps the composer open with an alert', async () => {
  renderHeader({ superdoc: superdocWithComments(vi.fn().mockResolvedValue({ success: false })) });
  fireEvent.keyDown(document.body, COMMENT_KEY);
  const dialog = await screen.findByRole('dialog', { name: ADD_COMMENT_TITLE });
  await userEvent.type(within(dialog).getByRole('textbox', { name: COMMENT_TEXT_LABEL }), COMMENT_TEXT);
  await userEvent.click(within(dialog).getByRole('button', { name: ADD_COMMENT_SUBMIT_LABEL }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(ADD_COMMENT_FAILED_MESSAGE);
});

test('the comment button stays disabled until there is text', async () => {
  renderHeader({ superdoc: superdocWithComments(vi.fn()) });
  fireEvent.keyDown(document.body, COMMENT_KEY);
  const dialog = await screen.findByRole('dialog', { name: ADD_COMMENT_TITLE });
  expect(within(dialog).getByRole('button', { name: ADD_COMMENT_SUBMIT_LABEL })).toBeDisabled();
});

test('the shortcuts dialog lists the review group for an editor', async () => {
  renderHeader({ superdoc: superdocStub() });
  fireEvent.keyDown(document.body, SHORTCUTS_KEY);
  expect(await screen.findByRole('heading', { name: SHORTCUT_GROUP_LABELS[ShortcutGroup.Review] })).toBeVisible();
});

test('Ctrl+Alt+M before the editor is ready opens no composer and is not consumed', () => {
  renderHeader({ superdoc: null });
  expect(fireEvent.keyDown(document.body, COMMENT_KEY)).toBe(true);
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('with no selection the comment anchors to the caret', async () => {
  const createFromSelection = vi.fn().mockResolvedValue({ success: true });
  const superdoc = superdocWithComments(createFromSelection);
  renderHeader({ superdoc });
  fireEvent.keyDown(document.body, COMMENT_KEY);
  const dialog = await screen.findByRole('dialog', { name: ADD_COMMENT_TITLE });
  await userEvent.type(within(dialog).getByRole('textbox', { name: COMMENT_TEXT_LABEL }), COMMENT_TEXT);
  await userEvent.click(within(dialog).getByRole('button', { name: ADD_COMMENT_SUBMIT_LABEL }));
  await waitFor(() => expect(createFromSelection).toHaveBeenCalledWith({ text: COMMENT_TEXT }));
});
