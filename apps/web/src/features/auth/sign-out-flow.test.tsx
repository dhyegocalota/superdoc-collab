import { AppRoute, UserRole, type SessionUser } from '@superdoc-collab/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, type InitialEntry } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { accountMenuLabel } from '@/features/account/account-copy';
import { AccountMenu } from '@/features/account/account-menu';
import { apiGet } from '@/lib/api';
import { jsonResponse } from '@/testing/json-response';
import { authClient } from './auth-client';
import { SIGN_OUT_LABEL } from './auth-copy';
import { RedirectIfSession } from './redirect-if-session';
import { RequireSession } from './require-session';
import { SIGNED_OUT_STATE } from './sign-out-state';
import { SESSION_QUERY_KEY } from './use-session';

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), apiGet: vi.fn() }));
vi.mock('./auth-client', () => ({ authClient: { signOut: vi.fn() } }));

const ADA: SessionUser = { id: 'user-1', name: 'Ada', email: 'ada@example.com', role: UserRole.User, timeZone: 'UTC' };
const FORM_TEXT = 'sign-in form';

let isSignedIn = true;

beforeEach(() => {
  isSignedIn = true;
  vi.mocked(apiGet).mockImplementation(async () => jsonResponse({ body: { user: isSignedIn ? ADA : null } }));
  vi.mocked(authClient.signOut).mockImplementation(async () => {
    isSignedIn = false;
    return {} as Awaited<ReturnType<typeof authClient.signOut>>;
  });
});
afterEach(() => vi.clearAllMocks());

function renderApp({
  initialEntries = [AppRoute.Documents],
  seededUser = null,
}: { initialEntries?: InitialEntry[]; seededUser?: SessionUser | null } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  if (seededUser) queryClient.setQueryData(SESSION_QUERY_KEY, seededUser);
  const router = createMemoryRouter(
    [
      { path: AppRoute.SignIn, element: <RedirectIfSession>{FORM_TEXT}</RedirectIfSession> },
      {
        path: AppRoute.Documents,
        element: (
          <RequireSession>
            <AccountMenu />
          </RequireSession>
        ),
      },
    ],
    { initialEntries },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

async function signOut(): Promise<void> {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: accountMenuLabel(ADA.name) }));
  await user.click(await screen.findByRole('menuitem', { name: SIGN_OUT_LABEL }));
}

test('signing out lands on the bare sign-in route and stays there', async () => {
  const { router, queryClient } = renderApp();
  await signOut();
  expect(await screen.findByText(FORM_TEXT)).toBeInTheDocument();
  await waitFor(() => expect(queryClient.getQueryData(SESSION_QUERY_KEY)).toBeNull());
  await waitFor(() => expect(router.state.location.state).toBeNull());
  expect(router.state.location.pathname).toBe(AppRoute.SignIn);
  expect(router.state.location.search).toBe('');
});

test('a session read that already sees the signed-out user does not turn into a next redirect', async () => {
  const { router, queryClient } = renderApp();
  await signOut();
  await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  expect(await screen.findByText(FORM_TEXT)).toBeInTheDocument();
  expect(router.state.location.search).toBe('');
});

test('arriving signed out while the session still looks signed in shows the form, clears the session and drops the marker', async () => {
  const { router, queryClient } = renderApp({ initialEntries: [{ pathname: AppRoute.SignIn, state: SIGNED_OUT_STATE }], seededUser: ADA });
  expect(await screen.findByText(FORM_TEXT)).toBeInTheDocument();
  await waitFor(() => expect(queryClient.getQueryData(SESSION_QUERY_KEY)).toBeNull());
  await waitFor(() => expect(router.state.location.state).toBeNull());
  expect(router.state.location.pathname).toBe(AppRoute.SignIn);
});
