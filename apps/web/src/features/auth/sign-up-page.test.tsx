import { AppRoute } from '@superdoc-history/types';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/testing/render-with-providers';
import { authClient } from './auth-client';
import { EMAIL_FIELD_LABEL, NAME_FIELD_LABEL, PASSWORD_FIELD_LABEL, SIGN_IN_LABEL, SIGN_UP_HEADING, SIGN_UP_LABEL } from './auth-copy';
import { SignUpPage } from './sign-up-page';

vi.mock('./auth-client', () => ({ authClient: { signUp: { email: vi.fn() } } }));

const signUpEmail = vi.mocked(authClient.signUp.email);

beforeEach(() => signUpEmail.mockReset());

test('sign-up asks for a name, an email and a new password and links to sign-in', () => {
  renderWithProviders(<SignUpPage />, { route: AppRoute.SignUp });
  expect(screen.getByText(SIGN_UP_HEADING)).toBeInTheDocument();
  expect(screen.getByLabelText(NAME_FIELD_LABEL)).toHaveAttribute('autocomplete', 'name');
  expect(screen.getByLabelText(EMAIL_FIELD_LABEL)).toHaveAttribute('type', 'email');
  expect(screen.getByLabelText(PASSWORD_FIELD_LABEL)).toHaveAttribute('autocomplete', 'new-password');
  expect(screen.getByRole('link', { name: SIGN_IN_LABEL })).toHaveAttribute('href', AppRoute.SignIn);
});

test('sign-up sends the three fields once', async () => {
  signUpEmail.mockResolvedValue({ data: null, error: null } as never);
  const user = userEvent.setup();
  renderWithProviders(<SignUpPage />, { route: AppRoute.SignUp });
  await user.type(screen.getByLabelText(NAME_FIELD_LABEL), 'Ada');
  await user.type(screen.getByLabelText(EMAIL_FIELD_LABEL), 'ada@example.com');
  await user.type(screen.getByLabelText(PASSWORD_FIELD_LABEL), 'long-enough-password');
  await user.click(screen.getByRole('button', { name: SIGN_UP_LABEL }));
  await waitFor(() => expect(signUpEmail).toHaveBeenCalledTimes(1));
  expect(signUpEmail.mock.calls[0]?.[0]).toEqual({ name: 'Ada', email: 'ada@example.com', password: 'long-enough-password' });
});
