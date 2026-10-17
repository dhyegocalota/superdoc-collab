import { HttpStatus, INVITE_TOKEN_HEADER, SIGN_UP_BY_INVITATION_MESSAGE } from '@superdoc-history/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';
import { SESSION_QUERY_KEY } from './use-session';
import { useAuthSubmit } from './use-auth-submit';

const navigate = vi.fn();

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));

const user = { id: 'user-1', name: 'Ada', email: 'ada@example.com' };

function renderSubmit({ queryClient, options }: { queryClient: QueryClient; options: Partial<Parameters<typeof useAuthSubmit>[0]> }) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  const form = { setError: vi.fn() } as never;
  const { result } = renderHook(() => useAuthSubmit({ form, request: async () => ({ error: null }), ...options }), { wrapper });
  return { submit: result.current, form };
}

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

test('hands the headers to the request and awaits afterSuccess before navigating', async () => {
  navigate.mockReset();
  const order: string[] = [];
  const headers = { [INVITE_TOKEN_HEADER]: 'tok' };
  const request = vi.fn(async (_values: object, _capture: unknown) => ({ error: null }));
  const afterSuccess = async () => {
    await Promise.resolve();
    order.push('afterSuccess');
  };
  navigate.mockImplementation(() => order.push('navigate'));
  const { submit } = renderSubmit({ queryClient: new QueryClient(), options: { request, headers, afterSuccess } });
  await submit({});
  expect(request.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ headers }));
  expect(order).toEqual(['afterSuccess', 'navigate']);
});

test('shows the server message on a 403 and does not navigate', async () => {
  navigate.mockReset();
  const request = async () => ({ error: { status: HttpStatus.Forbidden, message: SIGN_UP_BY_INVITATION_MESSAGE } });
  const { submit, form } = renderSubmit({ queryClient: new QueryClient(), options: { request } });
  await submit({});
  expect(form.setError).toHaveBeenCalledWith('root', { message: SIGN_UP_BY_INVITATION_MESSAGE });
  expect(navigate).not.toHaveBeenCalled();
});
