import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';
import { SESSION_QUERY_KEY } from './use-session';
import { useAuthSubmit } from './use-auth-submit';

const navigate = vi.fn();

vi.mock('react-router', async (importOriginal) => ({ ...(await importOriginal<typeof import('react-router')>()), useNavigate: () => navigate }));

const user = { id: 'user-1', name: 'Ada', email: 'ada@example.com' };

test('resolves the session before navigating', async () => {
  let currentUser: typeof user | null = null;
  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({ queryKey: SESSION_QUERY_KEY, queryFn: async () => currentUser });
  currentUser = user;
  const sessionAtNavigation: unknown[] = [];
  navigate.mockImplementation(() => sessionAtNavigation.push(queryClient.getQueryData(SESSION_QUERY_KEY)));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  const form = { setError: vi.fn() } as never;
  const { result } = renderHook(() => useAuthSubmit({ form, request: async () => ({ error: null }) }), { wrapper });
  await result.current({});
  expect(sessionAtNavigation).toEqual([user]);
});
