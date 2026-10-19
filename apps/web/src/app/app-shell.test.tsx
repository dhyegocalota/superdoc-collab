import { ApiPath, UserRole } from '@superdoc-collab/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { AppShell } from './app-shell';

const CAIO = { id: 'user-3', name: 'Caio', email: 'caio@example.com', role: UserRole.User, timeZone: null, impersonatedBy: 'admin-1' };
const PAGE_TEST_ID = 'routed-page';

function renderShell(user: typeof CAIO | null) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (input === ApiPath.Me) return jsonResponse({ body: { user } });
    throw new Error(`unexpected ${String(input)}`);
  });
  const router = createMemoryRouter([
    { element: <AppShell />, children: [{ path: '*', element: <div data-testid={PAGE_TEST_ID} className="h-full" /> }] },
  ]);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

test('the shell is a viewport-high column: the banner is a normal child and the routed page takes the remaining height', async () => {
  renderShell(CAIO);
  const banner = await screen.findByTestId('impersonation-banner');
  const pageSlot = screen.getByTestId(PAGE_TEST_ID).parentElement!;
  const shell = pageSlot.parentElement!;
  expect(shell).toHaveClass('flex', 'h-dvh', 'flex-col');
  expect(banner.parentElement).toBe(shell);
  expect(banner).toHaveClass('shrink-0');
  expect(pageSlot).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
});

test('without a banner the routed page still fills the shell', async () => {
  renderShell(null);
  const pageSlot = (await screen.findByTestId(PAGE_TEST_ID)).parentElement!;
  expect(pageSlot).toHaveClass('min-h-0', 'flex-1');
  expect(screen.queryByTestId('impersonation-banner')).not.toBeInTheDocument();
});
