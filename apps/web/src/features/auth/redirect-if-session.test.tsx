import { AppRoute, type SessionUser } from '@superdoc-history/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import { apiGet } from '@/lib/api';
import { RedirectIfSession } from './redirect-if-session';

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), apiGet: vi.fn() }));

const ADA: SessionUser = { id: 'user-1', name: 'Ada', email: 'ada@example.com' };
const FORM_TEXT = 'sign-in form';
const DOCUMENTS_TEXT = 'documents page';

function respondWithUser(user: SessionUser | null): void {
  vi.mocked(apiGet).mockResolvedValue(new Response(JSON.stringify({ user })));
}

function renderSignInRoute() {
  const router = createMemoryRouter(
    [
      { path: AppRoute.SignIn, element: <RedirectIfSession>{FORM_TEXT}</RedirectIfSession> },
      { path: AppRoute.Documents, element: DOCUMENTS_TEXT },
    ],
    { initialEntries: [AppRoute.SignIn] },
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
