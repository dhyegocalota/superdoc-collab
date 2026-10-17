import { HttpStatus, RETRY_AFTER_HEADER } from '@superdoc-history/types';
import { Hono } from 'hono';
import { expect, test } from 'vitest';
import { retryLater } from './retry-later';

test('an error body carries its status and Retry-After in whole seconds', async () => {
  const app = new Hono().get('/', (context) =>
    retryLater({ context, body: { error: 'later' }, status: HttpStatus.ServiceUnavailable, retryAfterSeconds: 7 }),
  );
  const response = await app.request('/');
  expect([response.status, response.headers.get(RETRY_AFTER_HEADER), await response.json()]).toEqual([
    HttpStatus.ServiceUnavailable,
    '7',
    { error: 'later' },
  ]);
});

test('an accepted body keeps its shape', async () => {
  const app = new Hono().get('/', (context) =>
    retryLater({ context, body: { sequence: 4 }, status: HttpStatus.Accepted, retryAfterSeconds: 1 }),
  );
  const response = await app.request('/');
  expect([response.status, response.headers.get(RETRY_AFTER_HEADER), await response.json()]).toEqual([
    HttpStatus.Accepted,
    '1',
    { sequence: 4 },
  ]);
});
