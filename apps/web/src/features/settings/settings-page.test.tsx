import { TimeZoneSource } from '@superdoc-collab/types';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { authClient } from '@/features/auth/auth-client';
import { SESSION_QUERY_KEY } from '@/features/auth/use-session';
import { browserTimeZone } from '@/lib/browser-time-zone';
import { useTimeZone } from '@/lib/use-time-zone';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  browserReportsMessage,
  SAVE_TIME_ZONE_FAILED_MESSAGE,
  SAVE_TIME_ZONE_LABEL,
  TIME_ZONE_FIELD_LABEL,
  TIME_ZONE_SAVED_TOAST,
  USE_BROWSER_TIME_ZONE_LABEL,
} from './settings-copy';
import { SettingsPage } from './settings-page';

vi.mock('@/lib/use-time-zone');
vi.mock('@/lib/browser-time-zone');
vi.mock('@/features/auth/auth-client', () => ({ authClient: { updateUser: vi.fn(), signOut: vi.fn() } }));

const ACCOUNT_ZONE = 'America/Sao_Paulo';
const BROWSER_ZONE = 'Europe/Lisbon';
const CHOSEN_ZONE = 'Asia/Kathmandu';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useTimeZone).mockReturnValue({ timeZone: ACCOUNT_ZONE, source: TimeZoneSource.Account });
  vi.mocked(browserTimeZone).mockReturnValue(BROWSER_ZONE);
  vi.mocked(authClient.updateUser).mockResolvedValue({ data: { status: true }, error: null });
});

function zoneSelect(): HTMLSelectElement {
  return screen.getByRole('combobox', { name: TIME_ZONE_FIELD_LABEL });
}

test('lists the zones with their offsets and preselects the account zone', () => {
  renderWithProviders(<SettingsPage />);
  expect(zoneSelect()).toHaveValue(ACCOUNT_ZONE);
  expect(screen.getByRole('option', { name: `${ACCOUNT_ZONE} (UTC-03:00)` })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'UTC (UTC+00:00)' })).toBeInTheDocument();
});

test('offers the browser zone when it differs and picks it on Use this', async () => {
  renderWithProviders(<SettingsPage />);
  expect(screen.getByText(browserReportsMessage(BROWSER_ZONE))).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: USE_BROWSER_TIME_ZONE_LABEL }));
  expect(zoneSelect()).toHaveValue(BROWSER_ZONE);
});

test('hides the browser hint when the browser reports the account zone', () => {
  vi.mocked(browserTimeZone).mockReturnValue(ACCOUNT_ZONE);
  renderWithProviders(<SettingsPage />);
  expect(screen.queryByRole('button', { name: USE_BROWSER_TIME_ZONE_LABEL })).not.toBeInTheDocument();
});

test('saves the chosen zone, refreshes the session and toasts', async () => {
  const queryClient = new QueryClient();
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
  renderWithProviders(<SettingsPage />, { queryClient });
  const user = userEvent.setup();
  await user.selectOptions(zoneSelect(), CHOSEN_ZONE);
  await user.click(screen.getByRole('button', { name: SAVE_TIME_ZONE_LABEL }));
  expect(await screen.findByText(TIME_ZONE_SAVED_TOAST)).toBeInTheDocument();
  expect(authClient.updateUser).toHaveBeenCalledWith({ timeZone: CHOSEN_ZONE });
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: SESSION_QUERY_KEY });
});

test('shows an inline error and keeps the selection when saving fails', async () => {
  vi.mocked(authClient.updateUser).mockResolvedValue({ data: null, error: { status: 500, statusText: 'Internal Server Error' } });
  renderWithProviders(<SettingsPage />);
  const user = userEvent.setup();
  await user.selectOptions(zoneSelect(), CHOSEN_ZONE);
  await user.click(screen.getByRole('button', { name: SAVE_TIME_ZONE_LABEL }));
  expect(await screen.findByRole('alert')).toHaveTextContent(SAVE_TIME_ZONE_FAILED_MESSAGE);
  await waitFor(() => expect(screen.getByRole('button', { name: SAVE_TIME_ZONE_LABEL })).toBeEnabled());
  expect(zoneSelect()).toHaveValue(CHOSEN_ZONE);
  expect(screen.queryByText(TIME_ZONE_SAVED_TOAST)).not.toBeInTheDocument();
});
