import { AppRoute } from '@superdoc-history/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, test, vi } from 'vitest';
import { apiGet } from '@/lib/api';
import { routes } from './router';

vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), apiGet: vi.fn() }));

test('an unknown path redirects to documents and then to sign-in when signed out', async () => {
  vi.mocked(apiGet).mockResolvedValue(new Response(JSON.stringify({ user: null })));
  const router = createMemoryRouter(routes, { initialEntries: ['/no/such/page'] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe(AppRoute.SignIn);
});
