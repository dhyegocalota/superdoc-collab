import { AUTH_ERROR_MESSAGE } from '@superdoc-history/types';

export const RETRY_AFTER_HEADER = 'X-Retry-After';
export const GENERIC_AUTH_FAILURE_MESSAGE = 'Something went wrong. Try again.';

const UNAUTHORIZED_STATUS = 401;
const TOO_MANY_REQUESTS_STATUS = 429;

function tooManyAttemptsMessage(retryAfterSeconds: string | null): string {
  if (!retryAfterSeconds) return GENERIC_AUTH_FAILURE_MESSAGE;
  return `Too many attempts. Try again in ${retryAfterSeconds} seconds.`;
}

export function authFailureMessage({ status, retryAfterSeconds }: { status: number; retryAfterSeconds: string | null }): string {
  if (status === UNAUTHORIZED_STATUS) return AUTH_ERROR_MESSAGE;
  if (status === TOO_MANY_REQUESTS_STATUS) return tooManyAttemptsMessage(retryAfterSeconds);
  return GENERIC_AUTH_FAILURE_MESSAGE;
}
