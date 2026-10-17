import { AppRoute } from '@superdoc-history/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { createMemoryRouter, parsePath, RouterProvider } from 'react-router';

const ANY_PATH = '*';

type RenderOptions = { route?: string; queryClient?: QueryClient; state?: unknown };

function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

export function renderWithProviders(
  element: ReactElement,
  { route = AppRoute.Documents, queryClient = createTestQueryClient(), state = null }: RenderOptions = {},
) {
  const router = createMemoryRouter(
    [
      { path: AppRoute.Document, element },
      { path: AppRoute.Share, element },
      { path: AppRoute.VersionView, element },
      { path: ANY_PATH, element },
    ],
    { initialEntries: [{ ...parsePath(route), state }] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return { queryClient, router };
}

export function renderHookWithRouter<Result>(
  hook: () => Result,
  { route = AppRoute.Documents, queryClient = createTestQueryClient(), state = null }: RenderOptions = {},
) {
  const result = {} as { current: Result };
  function HookProbe(): null {
    result.current = hook();
    return null;
  }
  const { router } = renderWithProviders(<HookProbe />, { route, queryClient, state });
  return { result, queryClient, router };
}
