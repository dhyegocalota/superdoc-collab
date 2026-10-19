import { AppRoute } from '@superdoc-collab/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu';
import { authClient } from './auth-client';
import { SIGN_OUT_LABEL } from './auth-copy';
import { clearUnsyncedEdits, getUnsyncedEditsSnapshot, setUnsynced } from '@/features/editor/unsynced-edits-store';
import { SignOutMenuItem } from './sign-out-menu-item';
import { SIGNED_OUT_STATE } from './sign-out-state';

const navigate = vi.fn();

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));
vi.mock('./auth-client', () => ({ authClient: { signOut: vi.fn() } }));

afterEach(() => clearUnsyncedEdits());

function renderMenuItem() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <DropdownMenu open>
          <DropdownMenuContent>
            <SignOutMenuItem />
          </DropdownMenuContent>
        </DropdownMenu>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test('renders as a menu item and still signs out', async () => {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DropdownMenu open>
          <DropdownMenuContent>
            <SignOutMenuItem />
          </DropdownMenuContent>
        </DropdownMenu>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await userEvent.setup().click(await screen.findByRole('menuitem', { name: SIGN_OUT_LABEL }));
  await waitFor(() => expect(navigate).toHaveBeenCalled());
  expect(authClient.signOut).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith(AppRoute.SignIn, { replace: true, state: SIGNED_OUT_STATE, flushSync: true });
});

test('while edits are unsynced it asks to leave and signs out only when the leave runs', async () => {
  vi.mocked(authClient.signOut).mockClear();
  setUnsynced(true);
  renderMenuItem();
  await userEvent.setup().click(await screen.findByRole('menuitem', { name: SIGN_OUT_LABEL }));
  expect(authClient.signOut).not.toHaveBeenCalled();
  const { pendingLeave } = getUnsyncedEditsSnapshot();
  expect(pendingLeave).not.toBeNull();
  pendingLeave!();
  expect(authClient.signOut).toHaveBeenCalledTimes(1);
});
