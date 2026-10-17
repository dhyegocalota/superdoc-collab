import {
  DocumentRole,
  HttpStatus,
  RETRY_AFTER_SECONDS,
  SUMMARIZE_BUSY_MESSAGE,
  SummarizeOutcome,
  type SummarizeResponse,
} from '@superdoc-collab/types';
import { Hono } from 'hono';
import { authorizedDocumentId } from '../documents/require-document-role';
import { INVALID_TIMELINE_QUERY_MESSAGE, selectionQuerySchema } from '../history/timeline-query';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';
import { retryLater } from '../http/retry-later';
import { documentTopics } from './document-topics';
import { SummarizeRefusal } from './summarize-service';

const SELECTION_PATH = '/:documentId/summaries/selection';

export function createInsightsRoutes({ services }: { services: AppServices }): Hono<SignedIn> {
  const routes = new Hono<SignedIn>();
  routes.get('/:documentId/topics', (context) => {
    const documentId = authorizedDocumentId({ context, documents: services.documents, minimumRole: DocumentRole.Reader });
    services.insights.topics.ensure(documentId);
    return context.json(documentTopics({ services, documentId }));
  });
  routes.get('/:documentId/summaries', (context) => {
    const documentId = authorizedDocumentId({ context, documents: services.documents, minimumRole: DocumentRole.Reader });
    return context.json(services.insights.summaries.read(documentId));
  });
  routes.get(SELECTION_PATH, (context) => {
    const documentId = authorizedDocumentId({ context, documents: services.documents, minimumRole: DocumentRole.Reader });
    const parsed = selectionQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: INVALID_TIMELINE_QUERY_MESSAGE }, HttpStatus.BadRequest);
    return context.json(services.insights.selection.read({ documentId, selection: parsed.data }));
  });
  routes.post(SELECTION_PATH, (context) => {
    const documentId = authorizedDocumentId({ context, documents: services.documents, minimumRole: DocumentRole.Editor });
    const parsed = selectionQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: INVALID_TIMELINE_QUERY_MESSAGE }, HttpStatus.BadRequest);
    const selection = parsed.data;
    const result = services.insights.summarize.request({ documentId, selection });
    if (result.outcome === SummarizeRefusal.Busy)
      return retryLater({
        context,
        body: { error: SUMMARIZE_BUSY_MESSAGE },
        status: HttpStatus.TooManyRequests,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    if (result.outcome === SummarizeRefusal.Unavailable)
      return retryLater({
        context,
        body: { error: result.reason },
        status: HttpStatus.ServiceUnavailable,
        retryAfterSeconds: RETRY_AFTER_SECONDS,
      });
    const response: SummarizeResponse = { ...services.insights.selection.read({ documentId, selection }), outcome: result.outcome };
    const isRunning = result.outcome === SummarizeOutcome.Started || result.outcome === SummarizeOutcome.Running;
    if (isRunning) return context.json(response, HttpStatus.Accepted);
    return context.json(response);
  });
  return routes;
}
