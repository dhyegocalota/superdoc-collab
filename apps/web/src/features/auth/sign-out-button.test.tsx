import { AppRoute } from '@superdoc-collab/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';
import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu';
import { authClient } from './auth-client';
import { SIGN_OUT_LABEL } from './auth-copy';
import { SignOutButton } from './sign-out-button';
import { SIGNED_OUT_STATE } from './sign-out-state';

const navigate = vi.fn();

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));
vi.mock('./auth-client', () => ({ authClient: { signOut: vi.fn() } }));

test('renders as a menu item and still signs out', async () => {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DropdownMenu open>
          <DropdownMenuContent>
            <SignOutButton />
          </DropdownMenuContent>
        </DropdownMenu>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await userEvent.setup().click(await screen.findByRole('menuitem', { name: SIGN_OUT_LABEL }));
  await waitFor(() => expect(navigate).toHaveBeenCalled());
  expect(authClient.signOut).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith(AppRoute.SignIn, { replace: true, state: SIGNED_OUT_STATE });
});
