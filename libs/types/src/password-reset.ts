import { HOUR_MS } from './constants';

export const PASSWORD_RESET_TTL_MS = HOUR_MS;
export const PASSWORD_RESET_QUERY_PARAMETER = 'token';
export const PASSWORD_RESET_SEGMENT = 'password-reset';
export const PASSWORD_RESET_DONE_MESSAGE = 'Your password was changed. Sign in with the new one.';
export const PASSWORD_RESET_INVALID_MESSAGE = 'This reset link is not valid or has expired. Ask an admin for a new one.';

export type CreatedPasswordReset = { url: string; expiresAt: number };

export class MissingPasswordResetTokenError extends Error {
  constructor(url: string) {
    super(`No password reset token in ${url}.`);
  }
}

export function passwordResetTokenOf(url: string): string {
  const token = new URL(url).searchParams.get(PASSWORD_RESET_QUERY_PARAMETER);
  if (!token) throw new MissingPasswordResetTokenError(url);
  return token;
}
