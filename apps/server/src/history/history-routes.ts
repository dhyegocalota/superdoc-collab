import {
  DocumentRole,
  EVENTS_PAGE_SIZE,
  HttpStatus,
  NON_NEGATIVE_INTEGER_PATTERN,
  TimelineQueryParam,
  type DocumentEditEvents,
} from '@superdoc-history/types';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireDocumentRole } from '../documents/require-document-role';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';
import { resolveEvents } from './resolved-events';

const INVALID_EVENTS_QUERY_MESSAGE = 'afterSequence must be a non-negative integer and limit an integer from 1 to the page size';
const eventsQuerySchema = z.object({
  [TimelineQueryParam.AfterSequence]: z.string().regex(NON_NEGATIVE_INTEGER_PATTERN).transform(Number).optional(),
  [TimelineQueryParam.Limit]: z.coerce.number().int().min(1).max(EVENTS_PAGE_SIZE).optional(),
});

function readDocumentEvents({
  services,
  documentId,
  afterSequence,
  limit,
}: {
  services: AppServices;
  documentId: string;
  afterSequence: number | null;
  limit: number;
}): DocumentEditEvents {
  const { events: stored, cursor, nextAfterSequence } = services.readModel.readPage({ documentName: documentId, afterSequence, limit });
  return { events: resolveEvents({ services, documentId, stored }), cursor, nextAfterSequence };
}

export function createHistoryRoutes({ services }: { services: AppServices }): Hono<SignedIn> {
  const routes = new Hono<SignedIn>();
  routes.get('/:documentId/events', (context) => {
    const documentId = context.req.param('documentId');
    requireDocumentRole({ documents: services.documents, documentId, userId: context.get('user').id, minimumRole: DocumentRole.Reader });
    const parsed = eventsQuerySchema.safeParse({
      [TimelineQueryParam.AfterSequence]: context.req.query(TimelineQueryParam.AfterSequence),
      [TimelineQueryParam.Limit]: context.req.query(TimelineQueryParam.Limit),
    });
    if (!parsed.success) return context.json({ error: INVALID_EVENTS_QUERY_MESSAGE }, HttpStatus.BadRequest);
    const { afterSequence, limit } = parsed.data;
    const afterSequenceOrNull = afterSequence === undefined ? null : afterSequence;
    if (limit === undefined)
      return context.json(readDocumentEvents({ services, documentId, afterSequence: afterSequenceOrNull, limit: EVENTS_PAGE_SIZE }));
    return context.json(readDocumentEvents({ services, documentId, afterSequence: afterSequenceOrNull, limit }));
  });
  return routes;
}
