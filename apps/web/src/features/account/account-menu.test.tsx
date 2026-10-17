import { AppRoute, UserRole, type SessionUser } from '@superdoc-collab/types';
import { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test } from 'vitest';
import { ADMIN_LINK_LABEL } from '@/features/admin/admin-copy';
import { SESSION_QUERY_KEY } from '@/features/auth/use-session';
import { SIGN_OUT_LABEL } from '@/features/auth/auth-copy';
import { CONNECTED_APPS_HEADING } from '@/features/connected-apps/connected-apps-copy';
import { SETTINGS_LINK_LABEL } from '@/features/settings/settings-copy';
import { THEME_STORAGE_KEY } from '@/lib/use-theme';
import { renderWithProviders } from '@/testing/render-with-providers';
import { AccountMenu } from './account-menu';
import { THEME_LABEL, accountMenuLabel } from './account-copy';

const USER: SessionUser = { id: 'user-1', name: 'Ana', email: 'ana@example.com', role: UserRole.User, timeZone: null };
const ADMIN: SessionUser = { ...USER, id: 'user-2', name: 'Bruno', email: 'bruno@example.com', role: UserRole.Admin };

function renderMenu(user: SessionUser) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(SESSION_QUERY_KEY, user);
  renderWithProviders(<AccountMenu />, { queryClient });
}

async function openMenu(user: SessionUser): Promise<void> {
  renderMenu(user);
  await userEvent.click(screen.getByRole('button', { name: accountMenuLabel(user.name) }));
}

afterEach(() => {
  document.documentElement.classList.remove('dark');
  localStorage.clear();
});

test('lists Settings, Connected apps, the theme radio group and Sign out, and Admin only for admins', async () => {
  await openMenu(USER);
  expect(await screen.findByRole('menuitem', { name: SETTINGS_LINK_LABEL })).toHaveAttribute('href', AppRoute.Settings);
  expect(screen.getByRole('menuitem', { name: CONNECTED_APPS_HEADING })).toHaveAttribute('href', AppRoute.ConnectedApps);
  expect(screen.queryByRole('menuitem', { name: ADMIN_LINK_LABEL })).not.toBeInTheDocument();
  expect(screen.getByText(THEME_LABEL)).toBeInTheDocument();
  expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual(['Light', 'Dark', 'System']);
  expect(screen.getByRole('menuitemradio', { name: 'System' })).toBeChecked();
  expect(screen.getByRole('menuitem', { name: SIGN_OUT_LABEL })).toBeInTheDocument();
  expect(screen.getByText(USER.name)).toBeInTheDocument();
  expect(screen.getByText(USER.email)).toBeInTheDocument();
});

test('an admin also sees the Admin link', async () => {
  await openMenu(ADMIN);
  expect(await screen.findByRole('menuitem', { name: ADMIN_LINK_LABEL })).toHaveAttribute('href', AppRoute.Admin);
});

test('the trigger is named after the signed-in user', () => {
  renderMenu(USER);
  expect(screen.getByRole('button', { name: 'Account, Ana' })).toHaveAttribute('aria-haspopup', 'menu');
});

test('choosing Dark adds the dark class at once', async () => {
  await openMenu(USER);
  await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Dark' }));
  expect(document.documentElement).toHaveClass('dark');
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toBeChecked();
});

test('the menu stays open after a theme choice', async () => {
  await openMenu(USER);
  await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Light' }));
  expect(screen.getByRole('menu')).toBeInTheDocument();
});

test('renders nothing while there is no session', () => {
  renderWithProviders(<AccountMenu />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
