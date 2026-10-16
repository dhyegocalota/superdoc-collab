import { AUTH_ERROR_MESSAGE } from '@superdoc-history/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import { authClient } from './auth-client';
import { SIGN_IN_LABEL, SIGN_IN_PENDING_LABEL } from './auth-copy';
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
  await user.click(screen.getByRole('button', { name: SIGN_IN_LABEL }));
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

test('disables the button and shows the pending label while the request is in flight', async () => {
  let finishRequest: (value: never) => void = () => undefined;
  signInEmail.mockReturnValue(new Promise((resolve) => (finishRequest = resolve)) as never);
  const user = renderSignInPage();
  await submitCredentials({ user, email: 'ada@example.com', password: 'long-enough-password' });
  expect(await screen.findByRole('button', { name: SIGN_IN_PENDING_LABEL })).toBeDisabled();
  finishRequest({ data: null, error: null } as never);
  await waitFor(() => expect(screen.getByRole('button', { name: SIGN_IN_LABEL })).toBeEnabled());
});

test('submits with Enter from the password field', async () => {
  signInEmail.mockResolvedValue({ data: null, error: null } as never);
  const user = renderSignInPage();
  await user.type(screen.getByLabelText('Email'), 'ada@example.com');
  await user.type(screen.getByLabelText('Password'), 'long-enough-password{Enter}');
  await waitFor(() => expect(signInEmail).toHaveBeenCalledTimes(1));
});
