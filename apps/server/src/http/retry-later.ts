import { RETRY_AFTER_HEADER, type HttpStatus } from '@superdoc-history/types';
import type { Context } from 'hono';

type RetryStatus = HttpStatus.Accepted | HttpStatus.TooManyRequests | HttpStatus.ServiceUnavailable;

export function retryLater({
  context,
  body,
  status,
  retryAfterSeconds,
}: {
  context: Context;
  body: Record<string, string | number>;
  status: RetryStatus;
  retryAfterSeconds: number;
}): Response {
  return context.json(body, status, { [RETRY_AFTER_HEADER]: String(retryAfterSeconds) });
}
