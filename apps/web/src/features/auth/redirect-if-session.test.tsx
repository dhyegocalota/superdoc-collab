import { AppRoute, UserRole, type SessionUser } from '@superdoc-collab/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, parsePath, RouterProvider } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import { apiGet } from '@/lib/api';
import { jsonResponse } from '@/testing/json-response';
import { RedirectIfSession } from './redirect-if-session';
import { SIGNED_OUT_STATE } from './sign-out-state';

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), apiGet: vi.fn() }));

const ADA: SessionUser = { id: 'user-1', name: 'Ada', email: 'ada@example.com', role: UserRole.User, timeZone: 'UTC' };
const FORM_TEXT = 'sign-in form';
const DOCUMENTS_TEXT = 'documents page';
const ADMIN_TEXT = 'admin page';
const EXTERNAL_NEXT = 'https://evil.example/steal';

function respondWithUser(user: SessionUser | null): void {
  vi.mocked(apiGet).mockResolvedValue(jsonResponse({ body: { user } }));
}

function renderSignInRoute(initialEntry: string = AppRoute.SignIn, state: unknown = null) {
  const router = createMemoryRouter(
    [
      { path: AppRoute.SignIn, element: <RedirectIfSession>{FORM_TEXT}</RedirectIfSession> },
      { path: AppRoute.Documents, element: DOCUMENTS_TEXT },
      { path: AppRoute.Admin, element: ADMIN_TEXT },
    ],
    { initialEntries: [{ ...parsePath(initialEntry), state }] },
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => vi.mocked(apiGet).mockReset());

test('redirects a signed-in user to documents', async () => {
  respondWithUser(ADA);
  renderSignInRoute();
  expect(await screen.findByText(DOCUMENTS_TEXT)).toBeInTheDocument();
  expect(screen.queryByText(FORM_TEXT)).not.toBeInTheDocument();
});

test('renders the form when signed out', async () => {
  respondWithUser(null);
  renderSignInRoute();
  expect(await screen.findByText(FORM_TEXT)).toBeInTheDocument();
});

test('a signed-in user goes to the page named by next', async () => {
  respondWithUser(ADA);
  renderSignInRoute(`${AppRoute.SignIn}?next=${encodeURIComponent(AppRoute.Admin)}`);
  expect(await screen.findByText(ADMIN_TEXT)).toBeInTheDocument();
});

test('a next pointing at another origin falls back to documents', async () => {
  respondWithUser(ADA);
  renderSignInRoute(`${AppRoute.SignIn}?next=${encodeURIComponent(EXTERNAL_NEXT)}`);
  expect(await screen.findByText(DOCUMENTS_TEXT)).toBeInTheDocument();
});

test('the signed-out landing keeps the next query for the form', async () => {
  respondWithUser(null);
  const nextSearch = `?next=${encodeURIComponent(AppRoute.Admin)}`;
  const router = renderSignInRoute(`${AppRoute.SignIn}${nextSearch}`, SIGNED_OUT_STATE);
  expect(await screen.findByText(FORM_TEXT)).toBeInTheDocument();
  await waitFor(() => expect(router.state.location.state).toBeNull());
  expect(router.state.location.search).toBe(nextSearch);
});
