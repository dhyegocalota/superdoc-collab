import { AppRoute, UserRole, type SessionUser } from '@superdoc-collab/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import { apiGet } from '@/lib/api';
import { jsonResponse } from '@/testing/json-response';
import { RedirectIfSession } from './redirect-if-session';

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), apiGet: vi.fn() }));

const ADA: SessionUser = { id: 'user-1', name: 'Ada', email: 'ada@example.com', role: UserRole.User, timeZone: 'UTC' };
const FORM_TEXT = 'sign-in form';
const DOCUMENTS_TEXT = 'documents page';
const CONNECTED_APPS_TEXT = 'connected apps page';

function respondWithUser(user: SessionUser | null): void {
  vi.mocked(apiGet).mockResolvedValue(jsonResponse({ body: { user } }));
}

function renderSignInRoute(entry: string = AppRoute.SignIn) {
  const router = createMemoryRouter(
    [
      { path: AppRoute.SignIn, element: <RedirectIfSession>{FORM_TEXT}</RedirectIfSession> },
      { path: AppRoute.Documents, element: DOCUMENTS_TEXT },
      { path: AppRoute.ConnectedApps, element: CONNECTED_APPS_TEXT },
    ],
    { initialEntries: [entry] },
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
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

test('redirects a signed-in user to the page the next parameter names', async () => {
  respondWithUser(ADA);
  renderSignInRoute(`${AppRoute.SignIn}?next=${encodeURIComponent(AppRoute.ConnectedApps)}`);
  expect(await screen.findByText(CONNECTED_APPS_TEXT)).toBeInTheDocument();
  expect(screen.queryByText(DOCUMENTS_TEXT)).not.toBeInTheDocument();
});
