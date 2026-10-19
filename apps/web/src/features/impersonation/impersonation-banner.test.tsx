import { ApiPath, AppRoute, HttpMethod, HttpStatus, STOP_IMPERSONATING_API_PATH, UserRole, type SessionUser } from '@superdoc-collab/types';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { AccountMenu } from '@/features/account/account-menu';
import { accountMenuLabel } from '@/features/account/account-copy';
import { jsonResponse } from '@/testing/json-response';
import { renderWithProviders } from '@/testing/render-with-providers';
import { ImpersonationBanner } from './impersonation-banner';
import {
  IMPERSONATION_ACTIONS_SENTENCE,
  STOP_IMPERSONATING_FAILED_MESSAGE,
  STOP_IMPERSONATING_LABEL,
  viewingAsLabel,
} from './impersonation-copy';

const CAIO: SessionUser = {
  id: 'user-3',
  name: 'Caio',
  email: 'caio@example.com',
  role: UserRole.User,
  timeZone: null,
  impersonatedBy: 'admin-1',
};
const ADMIN: SessionUser = { id: 'admin-1', name: 'Ada', email: 'ada@example.com', role: UserRole.Admin, timeZone: null };

function mockApi({ sessions, stopStatus = HttpStatus.Ok }: { sessions: SessionUser[]; stopStatus?: number }) {
  const remaining = [...sessions];
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (input === ApiPath.Me) return jsonResponse({ body: { user: remaining.length > 1 ? remaining.shift() : remaining[0] } });
    if (input === STOP_IMPERSONATING_API_PATH) return jsonResponse({ body: {}, status: stopStatus });
    throw new Error(`unexpected ${String(input)}`);
  });
}

afterEach(() => vi.restoreAllMocks());

test('while impersonating a status banner names the user, says the actions are theirs and offers Stop', async () => {
  mockApi({ sessions: [CAIO] });
  renderWithProviders(<ImpersonationBanner />);
  const banner = await screen.findByRole('status');
  expect(banner).toHaveAttribute('data-testid', 'impersonation-banner');
  expect(within(banner).getByText(viewingAsLabel(CAIO.name))).toBeInTheDocument();
  expect(within(banner).getByText(IMPERSONATION_ACTIONS_SENTENCE)).toBeInTheDocument();
  expect(within(banner).getByRole('button', { name: STOP_IMPERSONATING_LABEL })).toBeInTheDocument();
});

test('with a plain session or none the banner renders nothing', async () => {
  const fetchSpy = mockApi({ sessions: [ADMIN] });
  renderWithProviders(<ImpersonationBanner />);
  await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(ApiPath.Me, expect.anything()));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('Stop impersonating posts the stop, refetches the session and returns to Admin', async () => {
  const fetchSpy = mockApi({ sessions: [CAIO, ADMIN] });
  const user = userEvent.setup();
  const { router } = renderWithProviders(<ImpersonationBanner />, { route: AppRoute.Documents });
  await user.click(await screen.findByRole('button', { name: STOP_IMPERSONATING_LABEL }));
  await waitFor(() =>
    expect(fetchSpy).toHaveBeenCalledWith(STOP_IMPERSONATING_API_PATH, expect.objectContaining({ method: HttpMethod.Post })),
  );
  await waitFor(() => expect(router.state.location.pathname).toBe(AppRoute.Admin));
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
});

test('a failed stop keeps the banner and says so', async () => {
  mockApi({ sessions: [CAIO], stopStatus: HttpStatus.InternalServerError });
  const user = userEvent.setup();
  renderWithProviders(<ImpersonationBanner />);
  await user.click(await screen.findByRole('button', { name: STOP_IMPERSONATING_LABEL }));
  expect(await screen.findByText(STOP_IMPERSONATING_FAILED_MESSAGE)).toBeInTheDocument();
  expect(screen.getByRole('status')).toBeInTheDocument();
});

test('the account menu shows the impersonated user, not the admin', async () => {
  mockApi({ sessions: [CAIO] });
  renderWithProviders(<AccountMenu colorSlot={null} />);
  expect(await screen.findByRole('button', { name: accountMenuLabel(CAIO.name) })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: accountMenuLabel(ADMIN.name) })).not.toBeInTheDocument();
});
