import { AUTH_ERROR_MESSAGE, HttpStatus } from '@superdoc-collab/types';

export const AUTH_RETRY_AFTER_HEADER = 'X-Retry-After';
const GENERIC_AUTH_FAILURE_MESSAGE = 'Something went wrong. Try again.';

function tooManyAttemptsMessage(retryAfterSeconds: string | null): string {
  if (!retryAfterSeconds) return GENERIC_AUTH_FAILURE_MESSAGE;
  return `Too many attempts. Try again in ${retryAfterSeconds} seconds.`;
}

export function authFailureMessage({
  status,
  retryAfterSeconds,
  serverMessage,
}: {
  status: number;
  retryAfterSeconds: string | null;
  serverMessage: string | undefined;
}): string {
  if (status === HttpStatus.Forbidden && serverMessage) return serverMessage;
  if (status === HttpStatus.Unauthorized) return AUTH_ERROR_MESSAGE;
  if (status === HttpStatus.TooManyRequests) return tooManyAttemptsMessage(retryAfterSeconds);
  return GENERIC_AUTH_FAILURE_MESSAGE;
}

const EXPIRED_REQUEST_CODE = 'invalid_signature';

export function isExpiredRequest(error: object): boolean {
  return 'error' in error && error.error === EXPIRED_REQUEST_CODE;
}
