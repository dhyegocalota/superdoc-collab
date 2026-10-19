import {
  AdminResource,
  passwordResetApiPath,
  PASSWORD_RESET_QUERY_PARAMETER,
  SHOWCASE_API_PATH,
  SHOWCASE_TITLE,
  DocumentRole,
  type DocumentSummary,
  type CreatedPasswordReset,
  adminApiPath,
  ApiPath,
  AppRoute,
  HttpMethod,
  HttpStatus,
  InviteState,
  UserRole,
  UTC_TIME_ZONE,
  type AdminUser,
  UserAction,
  userActionApiPath,
  type CreatedInvite,
  type InviteSummary,
  type SessionUser,
} from '@superdoc-collab/types';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Toaster } from '@/components/ui/sonner';
import { createTestQueryClient } from '@/testing/render-with-providers';
import { RequireAdmin } from './require-admin';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { accountMenuLabel } from '@/features/account/account-copy';
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/documents-api';
import { SIGN_OUT_LABEL } from '@/features/auth/auth-copy';
import { HOME_LINK_LABEL } from '@/features/editor/editor-copy';
import { SETTINGS_LINK_LABEL } from '@/features/settings/settings-copy';
import { formatTimestamp } from '@/lib/format-date-time';
import { jsonResponse } from '@/testing/json-response';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  ACTION_FAILED_MESSAGE,
  ADMINS_ONLY_TOAST,
  ARCHIVE_DIALOG_DESCRIPTION,
  ARCHIVE_LABEL,
  ARCHIVED_CHIP_LABEL,
  actionsMenuLabel,
  archiveDialogTitle,
  CANCEL_LABEL,
  IMPERSONATE_LABEL,
  RESTORE_LABEL,
  COPY_FAILED_MESSAGE,
  COPY_LINK_LABEL,
  GENERATE_INVITE_LABEL,
  INVITE_COPIED_TOAST,
  INVITE_CREATED_TITLE,
  INVITE_STATE_LABELS,
  INVITES_TABLE_LABEL,
  MAKE_ADMIN_LABEL,
  MAKE_USER_LABEL,
  PASSWORD_RESET_COPIED_TOAST,
  PASSWORD_RESET_CREATED_TITLE,
  RESET_PASSWORD_LABEL,
  REVOKE_LABEL,
  SHOWCASE_BUTTON_LABEL,
  SHOWCASE_CREATED_TOAST,
  SHOWCASE_DESCRIPTION,
  USER_ROLE_LABELS,
  USERS_TABLE_LABEL,
} from './admin-copy';
import { AdminPage } from './admin-page';

const ADMIN_SESSION: SessionUser = {
  id: 'admin-1',
  name: 'Ada',
  email: 'ada@example.com',
  role: UserRole.Admin,
  timeZone: UTC_TIME_ZONE,
  impersonatedBy: null,
};
const ADMIN_USER: AdminUser = {
  id: 'admin-1',
  name: 'Ada',
  email: 'ada@example.com',
  role: UserRole.Admin,
  createdAt: Date.UTC(2026, 0, 5),
  isArchived: false,
};
const MEMBER_USER: AdminUser = {
  id: 'user-2',
  name: 'Bruno',
  email: 'bruno@example.com',
  role: UserRole.User,
  createdAt: Date.UTC(2026, 0, 6),
  isArchived: false,
};
const PENDING_INVITE: InviteSummary = {
  id: 'invite-1',
  state: InviteState.Pending,
  createdAt: Date.UTC(2026, 0, 7),
  expiresAt: Date.UTC(2026, 0, 14),
  createdBy: { name: 'Ada' },
  acceptedBy: null,
};
const ACCEPTED_INVITE: InviteSummary = {
  id: 'invite-2',
  state: InviteState.Accepted,
  createdAt: Date.UTC(2026, 0, 1),
  expiresAt: Date.UTC(2026, 0, 8),
  createdBy: { name: 'Ada' },
  acceptedBy: { name: 'Bruno' },
};
const CREATED_INVITE: CreatedInvite = { id: 'invite-3', url: 'http://localhost/sign-up?invite=secret', expiresAt: Date.UTC(2026, 0, 21) };
const CREATED_PASSWORD_RESET: CreatedPasswordReset = {
  url: `http://localhost/reset-password?${PASSWORD_RESET_QUERY_PARAMETER}=secret`,
  expiresAt: Date.UTC(2026, 0, 6, 1),
};
const USERS_PATH = adminApiPath(AdminResource.Users);
const INVITES_PATH = adminApiPath(AdminResource.Invites);

const CREATED_SHOWCASE: DocumentSummary = {
  id: 'document-1',
  title: SHOWCASE_TITLE,
  owner: { id: ADMIN_USER.id, name: ADMIN_USER.name },
  updatedAt: Date.UTC(2026, 0, 8),
  role: DocumentRole.Owner,
  preview: null,
  thumbnailUpdatedAt: null,
};

type MockOptions = { revokeStatus?: number; showcaseStatus?: number; users?: AdminUser[] };

function mockApi({
  revokeStatus = HttpStatus.NoContent,
  showcaseStatus = HttpStatus.Created,
  users = [ADMIN_USER, MEMBER_USER],
}: MockOptions = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const isRead = init?.method === undefined;
    if (input === ApiPath.Me) return jsonResponse({ body: { user: ADMIN_SESSION } });
    if (input === USERS_PATH && isRead) return jsonResponse({ body: users });
    if (input === INVITES_PATH && isRead) return jsonResponse({ body: [PENDING_INVITE, ACCEPTED_INVITE] });
    if (input === SHOWCASE_API_PATH && init?.method === HttpMethod.Post)
      return jsonResponse({ body: CREATED_SHOWCASE, status: showcaseStatus });
    if (input === INVITES_PATH && init?.method === HttpMethod.Post)
      return jsonResponse({ body: CREATED_INVITE, status: HttpStatus.Created });
    if (input === `${INVITES_PATH}/${PENDING_INVITE.id}`) return new Response(null, { status: revokeStatus });
    if (input === passwordResetApiPath(MEMBER_USER.id)) return jsonResponse({ body: CREATED_PASSWORD_RESET, status: HttpStatus.Created });
    if (input === `${USERS_PATH}/${MEMBER_USER.id}/role`) return jsonResponse({ body: { ...MEMBER_USER, role: UserRole.Admin } });
    if (input === userActionApiPath({ userId: MEMBER_USER.id, action: UserAction.Archive }))
      return jsonResponse({ body: { ...MEMBER_USER, isArchived: true } });
    if (input === userActionApiPath({ userId: MEMBER_USER.id, action: UserAction.Restore })) return jsonResponse({ body: MEMBER_USER });
    if (input === userActionApiPath({ userId: MEMBER_USER.id, action: UserAction.Impersonate }))
      return new Response(null, { status: HttpStatus.NoContent });
    throw new Error(`unexpected ${String(input)}`);
  });
}

function readCalls(fetchSpy: ReturnType<typeof mockApi>, path: string): number {
  return fetchSpy.mock.calls.filter(([input, init]) => input === path && init?.method === undefined).length;
}

function renderAdminPage() {
  return renderWithProviders(<AdminPage />, { route: AppRoute.Admin });
}

async function rowOf({ table, text }: { table: string; text: string }): Promise<HTMLElement> {
  const row = (await within(await screen.findByRole('table', { name: table })).findByText(text)).closest('tr');
  if (!row) throw new Error('row not found');
  return row;
}

async function openActions({ row, name }: { row: HTMLElement; name: string }): Promise<HTMLElement> {
  await userEvent.click(within(row).getByRole('button', { name: actionsMenuLabel(name) }));
  return screen.findByRole('menu');
}

async function actionsOf({ row, name }: { row: HTMLElement; name: string }): Promise<string[]> {
  const menu = await openActions({ row, name });
  const labels = within(menu)
    .queryAllByRole('menuitem')
    .map((item) => item.textContent);
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  return labels as string[];
}

async function chooseAction({ row, name, label }: { row: HTMLElement; name: string; label: string }): Promise<void> {
  const menu = await openActions({ row, name });
  await userEvent.click(within(menu).getByRole('menuitem', { name: label }));
}

afterEach(() => vi.restoreAllMocks());

test('lists users with their role and hides the role toggle on the signed-in admin', async () => {
  mockApi();
  renderAdminPage();
  const adminRow = await rowOf({ table: USERS_TABLE_LABEL, text: ADMIN_USER.email });
  const memberRow = await rowOf({ table: USERS_TABLE_LABEL, text: MEMBER_USER.email });
  expect(within(adminRow).getByText(USER_ROLE_LABELS[UserRole.Admin])).toBeInTheDocument();
  expect(await actionsOf({ row: adminRow, name: ADMIN_USER.name })).not.toContain(MAKE_USER_LABEL);
  expect(within(memberRow).getByText(USER_ROLE_LABELS[UserRole.User])).toBeInTheDocument();
  expect(await actionsOf({ row: memberRow, name: MEMBER_USER.name })).toContain(MAKE_ADMIN_LABEL);
  expect(within(memberRow).getByText(formatTimestamp({ time: MEMBER_USER.createdAt, timeZone: UTC_TIME_ZONE }))).toBeInTheDocument();
});

test('generate invite shows the URL in a read-only field, copies it, toasts and refetches the list', async () => {
  const fetchSpy = mockApi();
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText');
  renderAdminPage();
  await user.click(await screen.findByRole('button', { name: GENERATE_INVITE_LABEL }));
  const field = await screen.findByRole('textbox', { name: INVITE_CREATED_TITLE });
  expect(field).toHaveValue(CREATED_INVITE.url);
  expect(field).toHaveAttribute('readonly');
  await user.click(screen.getByRole('button', { name: COPY_LINK_LABEL }));
  expect(await screen.findByText(INVITE_COPIED_TOAST)).toBeInTheDocument();
  expect(writeText).toHaveBeenCalledWith(CREATED_INVITE.url);
  await waitFor(() => expect(readCalls(fetchSpy, INVITES_PATH)).toBe(2));
});

test('when the clipboard is unavailable the dialog still shows the URL and says to copy it by hand', async () => {
  mockApi();
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
  renderAdminPage();
  await user.click(await screen.findByRole('button', { name: GENERATE_INVITE_LABEL }));
  await user.click(await screen.findByRole('button', { name: COPY_LINK_LABEL }));
  expect(await screen.findByText(COPY_FAILED_MESSAGE)).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: INVITE_CREATED_TITLE })).toHaveValue(CREATED_INVITE.url);
});

test('every user row offers Reset password', async () => {
  mockApi();
  renderAdminPage();
  const adminRow = await rowOf({ table: USERS_TABLE_LABEL, text: ADMIN_USER.email });
  const memberRow = await rowOf({ table: USERS_TABLE_LABEL, text: MEMBER_USER.email });
  expect(await actionsOf({ row: adminRow, name: ADMIN_USER.name })).toContain(RESET_PASSWORD_LABEL);
  expect(await actionsOf({ row: memberRow, name: MEMBER_USER.name })).toContain(RESET_PASSWORD_LABEL);
});

test('reset password posts for that user, shows the link in a read-only field and copies it', async () => {
  const fetchSpy = mockApi();
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText');
  renderAdminPage();
  const row = await rowOf({ table: USERS_TABLE_LABEL, text: MEMBER_USER.email });
  await chooseAction({ row, name: MEMBER_USER.name, label: RESET_PASSWORD_LABEL });
  const field = await screen.findByRole('textbox', { name: PASSWORD_RESET_CREATED_TITLE });
  expect(field).toHaveValue(CREATED_PASSWORD_RESET.url);
  expect(field).toHaveAttribute('readonly');
  expect(fetchSpy).toHaveBeenCalledWith(passwordResetApiPath(MEMBER_USER.id), expect.objectContaining({ method: HttpMethod.Post }));
  await user.click(screen.getByRole('button', { name: COPY_LINK_LABEL }));
  expect(await screen.findByText(PASSWORD_RESET_COPIED_TOAST)).toBeInTheDocument();
  expect(writeText).toHaveBeenCalledWith(CREATED_PASSWORD_RESET.url);
});

test('revoke sends DELETE and refetches', async () => {
  const fetchSpy = mockApi();
  renderAdminPage();
  const row = await rowOf({ table: INVITES_TABLE_LABEL, text: INVITE_STATE_LABELS[InviteState.Pending] });
  await userEvent.click(within(row).getByRole('button', { name: REVOKE_LABEL }));
  await waitFor(() =>
    expect(fetchSpy).toHaveBeenCalledWith(`${INVITES_PATH}/${PENDING_INVITE.id}`, expect.objectContaining({ method: HttpMethod.Delete })),
  );
  await waitFor(() => expect(readCalls(fetchSpy, INVITES_PATH)).toBe(2));
});

test('a failed revoke shows the action-failed message', async () => {
  mockApi({ revokeStatus: HttpStatus.Conflict });
  renderAdminPage();
  const row = await rowOf({ table: INVITES_TABLE_LABEL, text: INVITE_STATE_LABELS[InviteState.Pending] });
  await userEvent.click(within(row).getByRole('button', { name: REVOKE_LABEL }));
  expect(await screen.findByText(ACTION_FAILED_MESSAGE)).toBeInTheDocument();
});

test('make admin posts the role and refetches users', async () => {
  const fetchSpy = mockApi();
  renderAdminPage();
  const row = await rowOf({ table: USERS_TABLE_LABEL, text: MEMBER_USER.email });
  await chooseAction({ row, name: MEMBER_USER.name, label: MAKE_ADMIN_LABEL });
  await waitFor(() =>
    expect(fetchSpy).toHaveBeenCalledWith(
      `${USERS_PATH}/${MEMBER_USER.id}/role`,
      expect.objectContaining({ method: HttpMethod.Post, body: JSON.stringify({ role: UserRole.Admin }) }),
    ),
  );
  await waitFor(() => expect(readCalls(fetchSpy, USERS_PATH)).toBe(2));
});

test('a pending row reads Pending with a Revoke button, an accepted row reads Accepted without one', async () => {
  mockApi();
  renderAdminPage();
  const pendingRow = await rowOf({ table: INVITES_TABLE_LABEL, text: INVITE_STATE_LABELS[InviteState.Pending] });
  const acceptedRow = await rowOf({ table: INVITES_TABLE_LABEL, text: INVITE_STATE_LABELS[InviteState.Accepted] });
  expect(within(pendingRow).getByRole('button', { name: REVOKE_LABEL })).toBeInTheDocument();
  expect(within(pendingRow).getByText(formatTimestamp({ time: PENDING_INVITE.expiresAt, timeZone: UTC_TIME_ZONE }))).toBeInTheDocument();
  expect(within(acceptedRow).queryByRole('button')).not.toBeInTheDocument();
  expect(within(acceptedRow).getByText(ACCEPTED_INVITE.acceptedBy!.name)).toBeInTheDocument();
});

test('the header uses AppTopBar and has no Sign out button', async () => {
  mockApi();
  renderAdminPage();
  const header = await screen.findByRole('banner');
  expect(await within(header).findByRole('button', { name: accountMenuLabel(ADMIN_SESSION.name) })).toBeInTheDocument();
  expect(within(header).getByRole('link', { name: HOME_LINK_LABEL })).toBeInTheDocument();
  expect(within(header).queryByRole('link', { name: SETTINGS_LINK_LABEL })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: SIGN_OUT_LABEL })).not.toBeInTheDocument();
});

test('the showcase button says a second press creates a second document', async () => {
  mockApi();
  renderAdminPage();
  const button = await screen.findByRole('button', { name: SHOWCASE_BUTTON_LABEL });
  expect(button).toHaveAccessibleDescription(SHOWCASE_DESCRIPTION);
});

test('creating the showcase posts, toasts and invalidates the documents list', async () => {
  const fetchSpy = mockApi();
  const user = userEvent.setup();
  const { queryClient } = renderAdminPage();
  queryClient.setQueryData(DOCUMENTS_QUERY_KEY, { mine: [], shared: [] });
  await user.click(await screen.findByRole('button', { name: SHOWCASE_BUTTON_LABEL }));
  expect(await screen.findByText(SHOWCASE_CREATED_TOAST)).toBeInTheDocument();
  expect(fetchSpy).toHaveBeenCalledWith(SHOWCASE_API_PATH, expect.objectContaining({ method: HttpMethod.Post }));
  expect(queryClient.getQueryState(DOCUMENTS_QUERY_KEY)?.isInvalidated).toBe(true);
});

test('a failed showcase creation shows the action-failed message', async () => {
  mockApi({ showcaseStatus: HttpStatus.InternalServerError });
  const user = userEvent.setup();
  renderAdminPage();
  await user.click(await screen.findByRole('button', { name: SHOWCASE_BUTTON_LABEL }));
  expect(await screen.findByText(ACTION_FAILED_MESSAGE)).toBeInTheDocument();
});

const ARCHIVED_MEMBER: AdminUser = { ...MEMBER_USER, isArchived: true };
const SECOND_ADMIN: AdminUser = { ...MEMBER_USER, id: 'admin-2', name: 'Caio', email: 'caio@example.com', role: UserRole.Admin };

test('other users offer Archive and Impersonate; the signed-in admin and another admin offer no Impersonate and the admin no Archive', async () => {
  mockApi({ users: [ADMIN_USER, MEMBER_USER, SECOND_ADMIN] });
  renderAdminPage();
  const adminRow = await rowOf({ table: USERS_TABLE_LABEL, text: ADMIN_USER.email });
  const memberRow = await rowOf({ table: USERS_TABLE_LABEL, text: MEMBER_USER.email });
  const secondAdminRow = await rowOf({ table: USERS_TABLE_LABEL, text: SECOND_ADMIN.email });
  expect(await actionsOf({ row: adminRow, name: ADMIN_USER.name })).toEqual([RESET_PASSWORD_LABEL]);
  expect(await actionsOf({ row: memberRow, name: MEMBER_USER.name })).toEqual([
    MAKE_ADMIN_LABEL,
    RESET_PASSWORD_LABEL,
    IMPERSONATE_LABEL,
    ARCHIVE_LABEL,
  ]);
  expect(await actionsOf({ row: secondAdminRow, name: SECOND_ADMIN.name })).toEqual([MAKE_USER_LABEL, RESET_PASSWORD_LABEL, ARCHIVE_LABEL]);
});

test('archive asks first, naming the person, and posts only after the confirmation, then refetches users', async () => {
  const fetchSpy = mockApi();
  const user = userEvent.setup();
  renderAdminPage();
  const row = await rowOf({ table: USERS_TABLE_LABEL, text: MEMBER_USER.email });
  await chooseAction({ row, name: MEMBER_USER.name, label: ARCHIVE_LABEL });
  const dialog = await screen.findByRole('alertdialog', { name: archiveDialogTitle(MEMBER_USER.name) });
  expect(within(dialog).getByText(ARCHIVE_DIALOG_DESCRIPTION)).toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining('/archive'), expect.anything());
  await user.click(within(dialog).getByRole('button', { name: ARCHIVE_LABEL }));
  await waitFor(() =>
    expect(fetchSpy).toHaveBeenCalledWith(
      userActionApiPath({ userId: MEMBER_USER.id, action: UserAction.Archive }),
      expect.objectContaining({ method: HttpMethod.Post }),
    ),
  );
  await waitFor(() => expect(readCalls(fetchSpy, USERS_PATH)).toBe(2));
});

test('cancelling the archive confirmation sends nothing', async () => {
  const fetchSpy = mockApi();
  const user = userEvent.setup();
  renderAdminPage();
  const row = await rowOf({ table: USERS_TABLE_LABEL, text: MEMBER_USER.email });
  await chooseAction({ row, name: MEMBER_USER.name, label: ARCHIVE_LABEL });
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: CANCEL_LABEL }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining('/archive'), expect.anything());
});

test('an archived row shows the Archived chip and Restore, with no Archive and no Impersonate; Restore posts and refetches', async () => {
  const fetchSpy = mockApi({ users: [ADMIN_USER, ARCHIVED_MEMBER] });
  const user = userEvent.setup();
  renderAdminPage();
  const row = await rowOf({ table: USERS_TABLE_LABEL, text: MEMBER_USER.email });
  expect(within(row).getByText(ARCHIVED_CHIP_LABEL)).toBeInTheDocument();
  expect(await actionsOf({ row, name: MEMBER_USER.name })).toEqual([MAKE_ADMIN_LABEL, RESET_PASSWORD_LABEL, RESTORE_LABEL]);
  await chooseAction({ row, name: MEMBER_USER.name, label: RESTORE_LABEL });
  await waitFor(() =>
    expect(fetchSpy).toHaveBeenCalledWith(
      userActionApiPath({ userId: MEMBER_USER.id, action: UserAction.Restore }),
      expect.objectContaining({ method: HttpMethod.Post }),
    ),
  );
  await waitFor(() => expect(readCalls(fetchSpy, USERS_PATH)).toBe(2));
});

test('an active row shows no Archived chip and no Restore', async () => {
  mockApi();
  renderAdminPage();
  const row = await rowOf({ table: USERS_TABLE_LABEL, text: MEMBER_USER.email });
  expect(within(row).queryByText(ARCHIVED_CHIP_LABEL)).not.toBeInTheDocument();
  expect(await actionsOf({ row, name: MEMBER_USER.name })).not.toContain(RESTORE_LABEL);
});

test('impersonate posts for that user and lands on the documents home', async () => {
  const fetchSpy = mockApi();
  const user = userEvent.setup();
  const { router } = renderAdminPage();
  const row = await rowOf({ table: USERS_TABLE_LABEL, text: MEMBER_USER.email });
  await chooseAction({ row, name: MEMBER_USER.name, label: IMPERSONATE_LABEL });
  await waitFor(() =>
    expect(fetchSpy).toHaveBeenCalledWith(
      userActionApiPath({ userId: MEMBER_USER.id, action: UserAction.Impersonate }),
      expect.objectContaining({ method: HttpMethod.Post }),
    ),
  );
  await waitFor(() => expect(router.state.location.pathname).toBe(AppRoute.Documents));
});

test('after Impersonate no admin query runs as the impersonated user and no Admins only toast shows', async () => {
  const fetchSpy = mockApi();
  const respond = fetchSpy.getMockImplementation()!;
  const impersonatedSession: SessionUser = { ...ADMIN_SESSION, id: MEMBER_USER.id, role: UserRole.User, impersonatedBy: ADMIN_USER.id };
  let isImpersonating = false;
  fetchSpy.mockImplementation(async (input, init) => {
    if (input === ApiPath.Me && isImpersonating) return jsonResponse({ body: { user: impersonatedSession } });
    const response = await respond(input, init);
    if (input === userActionApiPath({ userId: MEMBER_USER.id, action: UserAction.Impersonate })) isImpersonating = true;
    return response;
  });
  const router = createMemoryRouter(
    [
      {
        path: AppRoute.Admin,
        element: (
          <RequireAdmin>
            <AdminPage />
          </RequireAdmin>
        ),
      },
      { path: AppRoute.Documents, element: <p>Documents home</p> },
    ],
    { initialEntries: [AppRoute.Admin] },
  );
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  const row = await rowOf({ table: USERS_TABLE_LABEL, text: MEMBER_USER.email });
  await chooseAction({ row, name: MEMBER_USER.name, label: IMPERSONATE_LABEL });
  expect(await screen.findByText('Documents home')).toBeInTheDocument();
  await waitFor(() => expect(readCalls(fetchSpy, ApiPath.Me)).toBeGreaterThan(1));
  expect(readCalls(fetchSpy, USERS_PATH)).toBe(1);
  expect(readCalls(fetchSpy, INVITES_PATH)).toBe(1);
  expect(screen.queryByText(ADMINS_ONLY_TOAST)).not.toBeInTheDocument();
});

test('every row has exactly one button, the Actions trigger named for the person', async () => {
  mockApi({ users: [ADMIN_USER, MEMBER_USER] });
  renderAdminPage();
  const rows = [
    { row: await rowOf({ table: USERS_TABLE_LABEL, text: ADMIN_USER.email }), name: ADMIN_USER.name },
    { row: await rowOf({ table: USERS_TABLE_LABEL, text: MEMBER_USER.email }), name: MEMBER_USER.name },
  ];
  rows.forEach(({ row, name }) => {
    const buttons = within(row).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(actionsMenuLabel(name));
  });
});

test('the Actions menu opens with Enter, moves with the arrows and Escape returns focus to the trigger', async () => {
  mockApi();
  renderAdminPage();
  const row = await rowOf({ table: USERS_TABLE_LABEL, text: MEMBER_USER.email });
  const trigger = within(row).getByRole('button', { name: actionsMenuLabel(MEMBER_USER.name) });
  trigger.focus();
  await userEvent.keyboard('{Enter}');
  const menu = await screen.findByRole('menu');
  await userEvent.keyboard('{ArrowDown}');
  expect(within(menu).getAllByRole('menuitem')).toContain(document.activeElement);
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});
