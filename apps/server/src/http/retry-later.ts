import { RETRY_AFTER_HEADER, type HttpStatus } from '@superdoc-collab/types';
import type { Context } from 'hono';

type RetryStatus = HttpStatus.Accepted | HttpStatus.TooManyRequests | HttpStatus.ServiceUnavailable;

export type RetryLaterOptions = {
  context: Context;
  body: Record<string, string | number>;
  status: RetryStatus;
  retryAfterSeconds: number;
};

export function retryLater({ context, body, status, retryAfterSeconds }: RetryLaterOptions): Response {
  return context.json(body, status, { [RETRY_AFTER_HEADER]: String(retryAfterSeconds) });
}
