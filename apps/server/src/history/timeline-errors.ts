import { HttpStatus } from '@superdoc-collab/types';
import type { Context } from 'hono';

export const TIMELINE_UNAVAILABLE_MESSAGE = 'The timeline could not be built';

export function timelineErrorResponse({ error, context }: { error: Error; context: Context }): Response | null {
  throw new Error(`timelineErrorResponse is not implemented for ${error.message} on ${context.req.path} as ${HttpStatus.Ok}`);
}
