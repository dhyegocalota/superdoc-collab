import {
  DocumentRole,
  HttpStatus,
  RETRY_AFTER_SECONDS,
  SELECTION_SUMMARY_TOO_SOON_MESSAGE,
  TOPICS_REFRESH_TOO_SOON_MESSAGE,
} from '@superdoc-history/types';
import { Hono } from 'hono';
import { authorizedDocumentId } from '../documents/require-document-role';
import { INVALID_TIMELINE_QUERY_MESSAGE, selectionQuerySchema } from '../history/timeline-query';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';
import { retryLater } from '../http/retry-later';
import { documentTopics } from './document-topics';
import { LLM_BUSY_MESSAGE } from './llm-client';
import { SelectionRequestOutcome } from './selection-summaries-service';
import { RefreshOutcome } from './topics-service';

const SELECTION_PATH = '/:documentId/summaries/selection';

export function createInsightsRoutes({ services }: { services: AppServices }): Hono<SignedIn> {
  const routes = new Hono<SignedIn>();
  routes.get('/:documentId/topics', (context) => {
    const documentId = authorizedDocumentId({ context, documents: services.documents, minimumRole: DocumentRole.Reader });
    services.insights.topics.ensure(documentId);
    return context.json(documentTopics({ services, documentId }));
  });
  routes.post('/:documentId/topics/refresh', (context) => {
    const documentId = authorizedDocumentId({ context, documents: services.documents, minimumRole: DocumentRole.Editor });
    const result = services.insights.topics.refresh(documentId);
    if (result.outcome === RefreshOutcome.TooSoon)
      return retryLater({
        context,
        body: { error: TOPICS_REFRESH_TOO_SOON_MESSAGE },
        status: HttpStatus.TooManyRequests,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    return context.json(services.insights.topics.status(documentId), HttpStatus.Accepted);
  });
  routes.get('/:documentId/summaries', (context) => {
    const documentId = authorizedDocumentId({ context, documents: services.documents, minimumRole: DocumentRole.Reader });
    services.insights.summaries.refreshStale(documentId);
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
    const result = services.insights.selection.request({ documentId, selection });
    if (result.outcome === SelectionRequestOutcome.TooSoon)
      return retryLater({
        context,
        body: { error: SELECTION_SUMMARY_TOO_SOON_MESSAGE },
        status: HttpStatus.TooManyRequests,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    if (result.outcome === SelectionRequestOutcome.Unavailable)
      return retryLater({
        context,
        body: { error: result.reason },
        status: HttpStatus.ServiceUnavailable,
        retryAfterSeconds: RETRY_AFTER_SECONDS,
      });
    if (result.outcome === SelectionRequestOutcome.Busy)
      return retryLater({
        context,
        body: { error: LLM_BUSY_MESSAGE },
        status: HttpStatus.ServiceUnavailable,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    const view = services.insights.selection.read({ documentId, selection });
    const isRunning = result.outcome === SelectionRequestOutcome.Started || result.outcome === SelectionRequestOutcome.AlreadyRunning;
    if (isRunning) return context.json(view, HttpStatus.Accepted);
    return context.json(view);
  });
  return routes;
}
