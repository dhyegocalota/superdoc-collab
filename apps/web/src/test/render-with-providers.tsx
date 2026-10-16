import { AppRoute } from '@superdoc-history/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';


const ANY_PATH = '*';

function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

export function renderWithProviders(element: ReactElement, { route = AppRoute.Documents, queryClient = createTestQueryClient() }: { route?: string; queryClient?: QueryClient } = {}) {
  const router = createMemoryRouter(
    [
      { path: AppRoute.Document, element },
      { path: AppRoute.Share, element },
      { path: AppRoute.VersionView, element },
      { path: ANY_PATH, element },
    ],
    { initialEntries: [route] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { queryClient, router };
}

export function renderHookWithRouter<Result>(hook: () => Result, { route = AppRoute.Documents, queryClient = createTestQueryClient() }: { route?: string; queryClient?: QueryClient } = {}) {
  const result = {} as { current: Result };
  function HookProbe(): null {
    result.current = hook();
    return null;
  }
  const { router } = renderWithProviders(<HookProbe />, { route, queryClient });
  return { result, queryClient, router };
}
