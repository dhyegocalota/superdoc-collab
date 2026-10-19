import {
  AppRoute,
  HttpStatus,
  PASSWORD_RESET_DONE_MESSAGE,
  PASSWORD_RESET_INVALID_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  resetPasswordPagePath,
} from '@superdoc-collab/types';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/testing/render-with-providers';
import { authClient } from './auth-client';
import { NEW_PASSWORD_FIELD_LABEL, RESET_PASSWORD_LABEL, SIGN_IN_LABEL } from './auth-copy';
import { ResetPasswordPage } from './reset-password-page';

vi.mock('./auth-client', () => ({ authClient: { resetPassword: vi.fn() } }));

const resetPassword = vi.mocked(authClient.resetPassword);
const TOKEN = 'reset-token';
const NEW_PASSWORD = 'a-brand-new-password';

async function fillAndSubmit(password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(NEW_PASSWORD_FIELD_LABEL), password);
  await user.click(screen.getByRole('button', { name: RESET_PASSWORD_LABEL }));
}

beforeEach(() => resetPassword.mockReset());

test('with a token the page shows the new-password form', async () => {
  renderWithProviders(<ResetPasswordPage />, { route: resetPasswordPagePath(TOKEN) });
  expect(await screen.findByLabelText(NEW_PASSWORD_FIELD_LABEL)).toHaveAttribute('autocomplete', 'new-password');
  expect(screen.getByRole('button', { name: RESET_PASSWORD_LABEL })).toBeInTheDocument();
});

test('without a token the page shows the invalid message and a link to sign in', async () => {
  renderWithProviders(<ResetPasswordPage />, { route: AppRoute.ResetPassword });
  expect(await screen.findByText(PASSWORD_RESET_INVALID_MESSAGE)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: SIGN_IN_LABEL })).toHaveAttribute('href', AppRoute.SignIn);
  expect(screen.queryByLabelText(NEW_PASSWORD_FIELD_LABEL)).not.toBeInTheDocument();
});

test('a short password shows the validation message and does not call the server', async () => {
  renderWithProviders(<ResetPasswordPage />, { route: resetPasswordPagePath(TOKEN) });
  await fillAndSubmit('short');
  expect(await screen.findByText(PASSWORD_TOO_SHORT_MESSAGE)).toBeInTheDocument();
  expect(resetPassword).not.toHaveBeenCalled();
});

test('success sends the new password with the token, goes to sign in and announces the change', async () => {
  resetPassword.mockResolvedValue({ data: { status: true }, error: null } as never);
  const { router } = renderWithProviders(<ResetPasswordPage />, { route: resetPasswordPagePath(TOKEN) });
  await fillAndSubmit(NEW_PASSWORD);
  await waitFor(() => expect(resetPassword).toHaveBeenCalledWith({ newPassword: NEW_PASSWORD, token: TOKEN }));
  await waitFor(() => expect(router.state.location.pathname).toBe(AppRoute.SignIn));
  expect(await screen.findByText(PASSWORD_RESET_DONE_MESSAGE)).toBeInTheDocument();
});

test('an invalid or expired token swaps the form for the invalid message', async () => {
  resetPassword.mockResolvedValue({
    data: null,
    error: { status: HttpStatus.BadRequest, code: 'INVALID_TOKEN', message: 'Invalid token' },
  } as never);
  renderWithProviders(<ResetPasswordPage />, { route: resetPasswordPagePath(TOKEN) });
  await fillAndSubmit(NEW_PASSWORD);
  expect(await screen.findByText(PASSWORD_RESET_INVALID_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByLabelText(NEW_PASSWORD_FIELD_LABEL)).not.toBeInTheDocument();
});
