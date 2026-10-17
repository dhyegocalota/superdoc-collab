import {
  AdminResource,
  adminApiPath,
  ApiPath,
  AppRoute,
  HttpMethod,
  HttpStatus,
  InviteState,
  UserRole,
  UTC_TIME_ZONE,
  type AdminUser,
  type CreatedInvite,
  type InviteSummary,
  type SessionUser,
} from '@superdoc-collab/types';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { accountMenuLabel } from '@/features/account/account-copy';
import { SIGN_OUT_LABEL } from '@/features/auth/auth-copy';
import { HOME_LINK_LABEL } from '@/features/editor/editor-copy';
import { SETTINGS_LINK_LABEL } from '@/features/settings/settings-copy';
import { formatTimestamp } from '@/lib/format-date-time';
import { jsonResponse } from '@/testing/json-response';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  ACTION_FAILED_MESSAGE,
  COPY_FAILED_MESSAGE,
  COPY_LINK_LABEL,
  GENERATE_INVITE_LABEL,
  INVITE_COPIED_TOAST,
  INVITE_CREATED_TITLE,
  INVITE_STATE_LABELS,
  INVITES_TABLE_LABEL,
  MAKE_ADMIN_LABEL,
  REVOKE_LABEL,
  USER_ROLE_LABELS,
  USERS_TABLE_LABEL,
} from './admin-copy';
import { AdminPage } from './admin-page';

const ADMIN_SESSION: SessionUser = { id: 'admin-1', name: 'Ada', email: 'ada@example.com', role: UserRole.Admin, timeZone: UTC_TIME_ZONE };
const ADMIN_USER: AdminUser = {
  id: 'admin-1',
  name: 'Ada',
  email: 'ada@example.com',
  role: UserRole.Admin,
  createdAt: Date.UTC(2026, 0, 5),
};
const MEMBER_USER: AdminUser = {
  id: 'user-2',
  name: 'Bruno',
  email: 'bruno@example.com',
  role: UserRole.User,
  createdAt: Date.UTC(2026, 0, 6),
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
const USERS_PATH = adminApiPath(AdminResource.Users);
const INVITES_PATH = adminApiPath(AdminResource.Invites);

type MockOptions = { revokeStatus?: number };

function mockApi({ revokeStatus = HttpStatus.NoContent }: MockOptions = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const isRead = init?.method === undefined;
    if (input === ApiPath.Me) return jsonResponse({ body: { user: ADMIN_SESSION } });
    if (input === USERS_PATH && isRead) return jsonResponse({ body: [ADMIN_USER, MEMBER_USER] });
    if (input === INVITES_PATH && isRead) return jsonResponse({ body: [PENDING_INVITE, ACCEPTED_INVITE] });
    if (input === INVITES_PATH && init?.method === HttpMethod.Post)
      return jsonResponse({ body: CREATED_INVITE, status: HttpStatus.Created });
    if (input === `${INVITES_PATH}/${PENDING_INVITE.id}`) return new Response(null, { status: revokeStatus });
    if (input === `${USERS_PATH}/${MEMBER_USER.id}/role`) return jsonResponse({ body: { ...MEMBER_USER, role: UserRole.Admin } });
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

afterEach(() => vi.restoreAllMocks());

test('lists users with their role and hides the role toggle on the signed-in admin', async () => {
  mockApi();
  renderAdminPage();
  const adminRow = await rowOf({ table: USERS_TABLE_LABEL, text: ADMIN_USER.email });
  const memberRow = await rowOf({ table: USERS_TABLE_LABEL, text: MEMBER_USER.email });
  expect(within(adminRow).getByText(USER_ROLE_LABELS[UserRole.Admin])).toBeInTheDocument();
  expect(within(adminRow).queryByRole('button')).not.toBeInTheDocument();
  expect(within(memberRow).getByText(USER_ROLE_LABELS[UserRole.User])).toBeInTheDocument();
  expect(within(memberRow).getByRole('button', { name: MAKE_ADMIN_LABEL })).toBeInTheDocument();
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
  await userEvent.click(within(row).getByRole('button', { name: MAKE_ADMIN_LABEL }));
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
