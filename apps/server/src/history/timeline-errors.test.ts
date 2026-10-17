import { NonAdvancingBinError, TooManyBinsError } from '@superdoc-collab/history';
import { HttpStatus } from '@superdoc-collab/types';
import { Hono } from 'hono';
import { expect, test, vi } from 'vitest';
import { TIMELINE_UNAVAILABLE_MESSAGE, timelineErrorResponse } from './timeline-errors';
import { INVALID_TIMELINE_QUERY_MESSAGE } from './timeline-query';

function appThrowing(error: Error): Hono {
  const app = new Hono();
  app.onError((thrown, context) => {
    const response = timelineErrorResponse({ error: thrown, context });
    if (!response) throw thrown;
    return response;
  });
  app.get('/', () => {
    throw error;
  });
  return app;
}

test('too many bins answers 400 with the invalid query message', async () => {
  const response = await appThrowing(new TooManyBinsError(1)).request('/');
  expect(response.status).toBe(HttpStatus.BadRequest);
  expect(await response.json()).toEqual({ error: INVALID_TIMELINE_QUERY_MESSAGE });
});

test('a non advancing bin answers a logged 500 with a stable message', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const response = await appThrowing(new NonAdvancingBinError({ start: 1, next: 1 })).request('/');
  expect(response.status).toBe(HttpStatus.InternalServerError);
  expect(await response.json()).toEqual({ error: TIMELINE_UNAVAILABLE_MESSAGE });
  expect(logged).toHaveBeenCalledOnce();
  logged.mockRestore();
});
