import { AppRoute } from '@superdoc-history/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';

const ANY_PATH = '*';

export function renderWithProviders(element: ReactElement, { route = AppRoute.Documents }: { route?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: AppRoute.Document, element },
      { path: AppRoute.Share, element },
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
