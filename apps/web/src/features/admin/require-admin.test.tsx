import { ApiPath, AppRoute, UserRole, type SessionUser } from '@superdoc-collab/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { jsonResponse } from '@/testing/json-response';
import { ADMINS_ONLY_TOAST } from './admin-copy';
import { RequireAdmin } from './require-admin';

const ADMIN_TEXT = 'admin content';
const DOCUMENTS_TEXT = 'documents content';
const SIGN_IN_TEXT = 'sign-in content';
const USER: SessionUser = { id: 'user-1', name: 'Ada', email: 'ada@example.com', role: UserRole.User, timeZone: 'UTC' };

function renderGuard(user: SessionUser | null) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (input === ApiPath.Me) return jsonResponse({ body: { user } });
    throw new Error(`unexpected ${String(input)}`);
  });
  const router = createMemoryRouter(
    [
      { path: AppRoute.Admin, element: <RequireAdmin>{ADMIN_TEXT}</RequireAdmin> },
      { path: AppRoute.Documents, element: DOCUMENTS_TEXT },
      { path: AppRoute.SignIn, element: SIGN_IN_TEXT },
    ],
    { initialEntries: [AppRoute.Admin] },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return router;
}

afterEach(() => vi.restoreAllMocks());

test('a user is sent to documents with the Admins-only toast', async () => {
  const router = renderGuard(USER);
  expect(await screen.findByText(DOCUMENTS_TEXT)).toBeInTheDocument();
  expect(await screen.findByText(ADMINS_ONLY_TOAST)).toBeInTheDocument();
  expect(router.state.location.pathname).toBe(AppRoute.Documents);
});

test('signed out goes to sign-in with next', async () => {
  const router = renderGuard(null);
  expect(await screen.findByText(SIGN_IN_TEXT)).toBeInTheDocument();
  expect(router.state.location.pathname).toBe(AppRoute.SignIn);
  expect(router.state.location.search).toBe(`?next=${encodeURIComponent(AppRoute.Admin)}`);
});

test('an admin renders the children', async () => {
  renderGuard({ ...USER, role: UserRole.Admin });
  expect(await screen.findByText(ADMIN_TEXT)).toBeInTheDocument();
});
