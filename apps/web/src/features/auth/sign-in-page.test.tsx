import { AUTH_ERROR_MESSAGE } from '@superdoc-history/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import { authClient } from './auth-client';
import { SignInPage } from './sign-in-page';

vi.mock('./auth-client', () => ({ authClient: { signIn: { email: vi.fn() } } }));

const signInEmail = vi.mocked(authClient.signIn.email);

function renderSignInPage() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

async function submitCredentials({ user, email, password }: { user: ReturnType<typeof userEvent.setup>; email: string; password: string }) {
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => signInEmail.mockReset());

test('shows the validation message for an invalid email and does not call the server', async () => {
  const user = renderSignInPage();
  await submitCredentials({ user, email: 'not-an-email', password: 'long-enough-password' });
  expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
  expect(signInEmail).not.toHaveBeenCalled();
});

test('submits the trimmed lowercase email once', async () => {
  signInEmail.mockResolvedValue({ data: null, error: null } as never);
  const user = renderSignInPage();
  await submitCredentials({ user, email: '  Ada@Example.COM ', password: 'long-enough-password' });
  await waitFor(() => expect(signInEmail).toHaveBeenCalledTimes(1));
  expect(signInEmail.mock.calls[0]?.[0]).toEqual({ email: 'ada@example.com', password: 'long-enough-password' });
});

test('shows only the generic message on a 401', async () => {
  signInEmail.mockResolvedValue({ data: null, error: { status: 401, statusText: 'Unauthorized', message: 'User not found' } } as never);
  const user = renderSignInPage();
  await submitCredentials({ user, email: 'ada@example.com', password: 'long-enough-password' });
  expect(await screen.findByText(AUTH_ERROR_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
});
