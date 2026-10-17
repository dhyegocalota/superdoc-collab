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
import { authorizedDocumentId } from '../documents/require-document-role';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';
import { resolveEvents } from './resolved-events';

const INVALID_EVENTS_QUERY_MESSAGE = 'afterSequence must be a non-negative integer and limit an integer from 1 to the page size';
const eventsQuerySchema = z.object({
  [TimelineQueryParam.AfterSequence]: z
    .string()
    .regex(NON_NEGATIVE_INTEGER_PATTERN)
    .transform(Number)
    .optional()
    .transform((value) => (value === undefined ? null : value)),
  [TimelineQueryParam.Limit]: z.coerce.number().int().min(1).max(EVENTS_PAGE_SIZE).default(EVENTS_PAGE_SIZE),
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
    const documentId = authorizedDocumentId({ context, documents: services.documents, minimumRole: DocumentRole.Reader });
    const parsed = eventsQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: INVALID_EVENTS_QUERY_MESSAGE }, HttpStatus.BadRequest);
    const { afterSequence, limit } = parsed.data;
    return context.json(readDocumentEvents({ services, documentId, afterSequence, limit }));
  });
  return routes;
}
