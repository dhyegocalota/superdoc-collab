import { AppRoute, resetPasswordPagePath, UserRole } from '@superdoc-collab/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, test, vi } from 'vitest';
import { ABOUT_HEADING } from '@/features/about/about-copy';
import { NEW_PASSWORD_FIELD_LABEL } from '@/features/auth/auth-copy';
import { apiGet } from '@/lib/api';
import { jsonResponse } from '@/testing/json-response';
import { routes } from './router';

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), apiGet: vi.fn() }));

test('an unknown path redirects to documents and then to sign-in when signed out', async () => {
  vi.mocked(apiGet).mockResolvedValue(jsonResponse({ body: { user: null } }));
  const router = createMemoryRouter(routes, { initialEntries: ['/no/such/page'] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe(AppRoute.SignIn);
});

test('the print route stays on its path and needs no session', async () => {
  vi.mocked(apiGet).mockResolvedValue(jsonResponse({ body: { user: null } }));
  const router = createMemoryRouter(routes, { initialEntries: [AppRoute.Print] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  expect(await screen.findByTestId('print-page')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe(AppRoute.Print);
});

test('the reset password route needs no session and keeps its path', async () => {
  vi.mocked(apiGet).mockResolvedValue(jsonResponse({ body: { user: null } }));
  const router = createMemoryRouter(routes, { initialEntries: [resetPasswordPagePath('reset-token')] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  expect(await screen.findByLabelText(NEW_PASSWORD_FIELD_LABEL)).toBeInTheDocument();
  expect(router.state.location.pathname).toBe(AppRoute.ResetPassword);
});

test('the about route needs no session and shows the About page', async () => {
  vi.mocked(apiGet).mockResolvedValue(jsonResponse({ body: { user: null } }));
  const router = createMemoryRouter(routes, { initialEntries: [AppRoute.About] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('heading', { name: ABOUT_HEADING })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe(AppRoute.About);
});

test.each([
  {
    name: 'while impersonating',
    user: { id: 'user-3', name: 'Caio', email: 'caio@example.com', role: UserRole.User, timeZone: null, impersonatedBy: 'admin-1' },
    count: 1,
  },
  {
    name: 'with a plain session',
    user: { id: 'user-3', name: 'Caio', email: 'caio@example.com', role: UserRole.User, timeZone: null },
    count: 0,
  },
])('the impersonation banner shows on the about route $name: $count', async ({ user, count }) => {
  vi.mocked(apiGet).mockResolvedValue(jsonResponse({ body: { user } }));
  const router = createMemoryRouter(routes, { initialEntries: [AppRoute.About] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('heading', { name: ABOUT_HEADING })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryAllByTestId('impersonation-banner')).toHaveLength(count));
});
