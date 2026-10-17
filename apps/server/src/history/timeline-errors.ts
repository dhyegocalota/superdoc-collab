import { NonAdvancingBinError, TooManyBinsError } from '@superdoc-collab/history';
import { HttpStatus } from '@superdoc-collab/types';
import type { Context } from 'hono';
import { INVALID_TIMELINE_QUERY_MESSAGE } from './timeline-query';

export const TIMELINE_UNAVAILABLE_MESSAGE = 'The timeline could not be built';
const TIMELINE_UNAVAILABLE_LOG = 'timeline bins did not advance:';

export function timelineErrorResponse({ error, context }: { error: Error; context: Context }): Response | null {
  if (error instanceof TooManyBinsError) return context.json({ error: INVALID_TIMELINE_QUERY_MESSAGE }, HttpStatus.BadRequest);
  if (!(error instanceof NonAdvancingBinError)) return null;
  console.error(TIMELINE_UNAVAILABLE_LOG, error.message);
  return context.json({ error: TIMELINE_UNAVAILABLE_MESSAGE }, HttpStatus.InternalServerError);
}
