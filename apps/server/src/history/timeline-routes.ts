import { DocumentRole, HttpStatus } from '@superdoc-collab/types';
import { Hono } from 'hono';
import { authorizedDocumentId } from '../documents/require-document-role';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';
import { editsQuerySchema, INVALID_TIMELINE_QUERY_MESSAGE, timelineQuerySchema } from './timeline-query';
import { buildBinEdits, buildDocumentTimeline } from './timeline-service';

const EDITS_PATH = '/:documentId/timeline/edits';

export function createTimelineRoutes({ services }: { services: AppServices }): Hono<SignedIn> {
  const routes = new Hono<SignedIn>();
  routes.get('/:documentId/timeline', (context) => {
    const documentId = authorizedDocumentId({ context, documents: services.documents, minimumRole: DocumentRole.Reader });
    const parsed = timelineQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: INVALID_TIMELINE_QUERY_MESSAGE }, HttpStatus.BadRequest);
    const { term, author, binMs, timeZone } = parsed.data;
    services.insights.topics.ensure(documentId);
    const timeline = buildDocumentTimeline({ services, documentId, filter: { term, author }, binMs, timeZone });
    services.insights.topics.onTimelineRead(documentId);
    return context.json(timeline);
  });
  routes.get(EDITS_PATH, (context) => {
    const documentId = authorizedDocumentId({ context, documents: services.documents, minimumRole: DocumentRole.Reader });
    const parsed = editsQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: INVALID_TIMELINE_QUERY_MESSAGE }, HttpStatus.BadRequest);
    const { term, author, binMs, binStart, timeZone } = parsed.data;
    return context.json(buildBinEdits({ services, documentId, filter: { term, author }, binStart, binMs, timeZone }));
  });
  return routes;
}
