import { AppRoute, UserRole, type SessionUser } from '@superdoc-collab/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, type InitialEntry } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { accountMenuLabel } from '@/features/account/account-copy';
import { AccountMenu } from '@/features/account/account-menu';
import { apiGet } from '@/lib/api';
import { jsonResponse } from '@/testing/json-response';
import { renderHookWithRouter } from '@/testing/render-with-providers';
import { authClient } from './auth-client';
import { SIGN_OUT_LABEL } from './auth-copy';
import { RedirectIfSession } from './redirect-if-session';
import { RequireSession } from './require-session';
import { SIGNED_OUT_STATE } from './sign-out-state';
import { SESSION_QUERY_KEY } from './use-session';
import { useSignOut } from './use-sign-out';

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), apiGet: vi.fn() }));
vi.mock('./auth-client', () => ({ authClient: { signOut: vi.fn() } }));

const ADA: SessionUser = { id: 'user-1', name: 'Ada', email: 'ada@example.com', role: UserRole.User, timeZone: 'UTC' };
const FORM_TEXT = 'sign-in form';
const SIGN_IN_REDIRECT_WITH_NEXT_SEARCH = `?next=${encodeURIComponent(AppRoute.Documents)}`;
const SLOW_SIGN_IN_RENDER_MILLISECONDS = 10;

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

function BusyForm({ renderMilliseconds }: { renderMilliseconds: number }) {
  const renderEnd = performance.now() + renderMilliseconds;
  while (performance.now() < renderEnd);
  return FORM_TEXT;
}

function renderApp({
  initialEntries = [AppRoute.Documents],
  seededUser = null,
  signInRenderMilliseconds = 0,
}: { initialEntries?: InitialEntry[]; seededUser?: SessionUser | null; signInRenderMilliseconds?: number } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  if (seededUser) queryClient.setQueryData(SESSION_QUERY_KEY, seededUser);
  const router = createMemoryRouter(
    [
      {
        path: AppRoute.SignIn,
        element: (
          <RedirectIfSession>
            <BusyForm renderMilliseconds={signInRenderMilliseconds} />
          </RedirectIfSession>
        ),
      },
      {
        path: AppRoute.Documents,
        element: (
          <RequireSession>
            <AccountMenu colorSlot={null} />
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

test('a sign-in route that renders slowly still ends on the bare sign-in route', async () => {
  const { router } = renderApp({ signInRenderMilliseconds: SLOW_SIGN_IN_RENDER_MILLISECONDS });
  const visitedSearches: string[] = [];
  router.subscribe((state) => visitedSearches.push(state.location.search));
  await signOut();
  expect(await screen.findByText(FORM_TEXT)).toBeInTheDocument();
  await waitFor(() => expect(router.state.location.state).toBeNull());
  expect(visitedSearches).not.toContain(SIGN_IN_REDIRECT_WITH_NEXT_SEARCH);
  expect(router.state.location.search).toBe('');
});

test('navigates before it clears the cached session', async () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(SESSION_QUERY_KEY, ADA);
  const { result, router } = renderHookWithRouter(useSignOut, { queryClient });
  const sessionsAtNavigation: Array<SessionUser | null | undefined> = [];
  const navigate = router.navigate.bind(router);
  vi.spyOn(router, 'navigate').mockImplementation((...args: Parameters<typeof router.navigate>) => {
    sessionsAtNavigation.push(queryClient.getQueryData<SessionUser | null>(SESSION_QUERY_KEY));
    return navigate(...args);
  });
  await result.current();
  expect(sessionsAtNavigation).toEqual([ADA]);
  expect(queryClient.getQueryData(SESSION_QUERY_KEY)).toBeNull();
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

test('signing out sets the session to signed out and invalidates it', async () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(SESSION_QUERY_KEY, ADA);
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const { result } = renderHookWithRouter(useSignOut, { queryClient });
  await result.current();
  expect(queryClient.getQueryData(SESSION_QUERY_KEY)).toBeNull();
  expect(invalidate).toHaveBeenCalledWith({ queryKey: SESSION_QUERY_KEY });
});
