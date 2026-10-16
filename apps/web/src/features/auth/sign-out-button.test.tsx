import { AppRoute } from '@superdoc-history/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';
import { authClient } from './auth-client';
import { SignOutButton } from './sign-out-button';
import { SESSION_QUERY_KEY } from './use-session';

const navigate = vi.fn();

vi.mock('react-router', async (importOriginal) => ({ ...(await importOriginal<typeof import('react-router')>()), useNavigate: () => navigate }));
vi.mock('./auth-client', () => ({ authClient: { signOut: vi.fn() } }));

test('navigates to the bare sign-in route and clears the session', async () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(SESSION_QUERY_KEY, { id: 'user-1', name: 'Ada', email: 'ada@example.com' });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SignOutButton />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(queryClient.getQueryData(SESSION_QUERY_KEY)).toBeNull());
  expect(authClient.signOut).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith(AppRoute.SignIn, { replace: true });
});
