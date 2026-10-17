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
const SHARE_TEXT = 'share landing';
const SHARE_PATH = '/share/token-1';
const FOREIGN_NEXT = 'https://evil.example/share/x';

function respondWithUser(user: SessionUser | null): void {
  vi.mocked(apiGet).mockResolvedValue(jsonResponse({ body: { user } }));
}

function renderSignInRoute(initialEntry: string = AppRoute.SignIn) {
  const router = createMemoryRouter(
    [
      { path: AppRoute.SignIn, element: <RedirectIfSession>{FORM_TEXT}</RedirectIfSession> },
      { path: AppRoute.Documents, element: DOCUMENTS_TEXT },
      { path: AppRoute.Share, element: SHARE_TEXT },
    ],
    { initialEntries: [initialEntry] },
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

test('redirects a signed-in user to the next path it was sent from', async () => {
  respondWithUser(ADA);
  renderSignInRoute(`${AppRoute.SignIn}?next=${encodeURIComponent(SHARE_PATH)}`);
  expect(await screen.findByText(SHARE_TEXT)).toBeInTheDocument();
  expect(screen.queryByText(DOCUMENTS_TEXT)).not.toBeInTheDocument();
});

test('ignores a next path on another origin', async () => {
  respondWithUser(ADA);
  renderSignInRoute(`${AppRoute.SignIn}?next=${encodeURIComponent(FOREIGN_NEXT)}`);
  expect(await screen.findByText(DOCUMENTS_TEXT)).toBeInTheDocument();
});
