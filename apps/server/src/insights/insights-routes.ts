import { DocumentRole, HttpStatus, MIN_RETRY_AFTER_MS, RETRY_AFTER_HEADER, SECOND_MS, SELECTION_SUMMARY_TOO_SOON_MESSAGE, TOPICS_REFRESH_TOO_SOON_MESSAGE, type DocumentTopics } from '@superdoc-history/types';
import { Hono } from 'hono';
import { requireDocumentRole } from '../documents/require-document-role';
import { INVALID_TIMELINE_QUERY_MESSAGE, queryOf, selectionQuerySchema } from '../history/timeline-query';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';
import { LLM_BUSY_MESSAGE } from './llm-client';
import { SelectionRequestOutcome } from './selection-summaries-service';
import { RefreshOutcome } from './topics-service';

const SELECTION_PATH = '/:documentId/summaries/selection';
const BUSY_RETRY_AFTER_SECONDS = MIN_RETRY_AFTER_MS / SECOND_MS;

function parseSelection(read: (name: string) => string | undefined): ReturnType<typeof selectionQuerySchema.safeParse> {
  return selectionQuerySchema.safeParse(queryOf({ read, names: Object.keys(selectionQuerySchema.shape) }));
}

function documentTopics({ services, documentId }: { services: AppServices; documentId: string }): DocumentTopics {
  const topics = services.insightsRepository.topics(documentId).map((topic) => ({ id: topic.id, name: topic.name, blockCount: topic.blockIds.length }));
  return { status: services.insights.topics.status(documentId), topics };
}

export function createInsightsRoutes({ services }: { services: AppServices }): Hono<SignedIn> {
  const routes = new Hono<SignedIn>();
  routes.get('/:documentId/topics', (context) => {
    const documentId = context.req.param('documentId');
    requireDocumentRole({ documents: services.documents, documentId, userId: context.get('user').id, minimumRole: DocumentRole.Reader });
    services.insights.topics.ensure(documentId);
    return context.json(documentTopics({ services, documentId }));
  });
  routes.post('/:documentId/topics/refresh', (context) => {
    const documentId = context.req.param('documentId');
    requireDocumentRole({ documents: services.documents, documentId, userId: context.get('user').id, minimumRole: DocumentRole.Editor });
    const result = services.insights.topics.refresh(documentId);
    if (result.outcome === RefreshOutcome.TooSoon) return context.json({ error: TOPICS_REFRESH_TOO_SOON_MESSAGE }, HttpStatus.TooManyRequests, { [RETRY_AFTER_HEADER]: String(result.retryAfterSeconds) });
    return context.json(services.insights.topics.status(documentId), HttpStatus.Accepted);
  });
  routes.get('/:documentId/summaries', (context) => {
    const documentId = context.req.param('documentId');
    requireDocumentRole({ documents: services.documents, documentId, userId: context.get('user').id, minimumRole: DocumentRole.Reader });
    services.insights.summaries.refreshStale(documentId);
    return context.json(services.insights.summaries.read(documentId));
  });
  routes.get(SELECTION_PATH, (context) => {
    const documentId = context.req.param('documentId');
    requireDocumentRole({ documents: services.documents, documentId, userId: context.get('user').id, minimumRole: DocumentRole.Reader });
    const parsed = parseSelection((name) => context.req.query(name));
    if (!parsed.success) return context.json({ error: INVALID_TIMELINE_QUERY_MESSAGE }, HttpStatus.BadRequest);
    return context.json(services.insights.selection.read({ documentId, selection: parsed.data }));
  });
  routes.post(SELECTION_PATH, (context) => {
    const documentId = context.req.param('documentId');
    requireDocumentRole({ documents: services.documents, documentId, userId: context.get('user').id, minimumRole: DocumentRole.Editor });
    const parsed = parseSelection((name) => context.req.query(name));
    if (!parsed.success) return context.json({ error: INVALID_TIMELINE_QUERY_MESSAGE }, HttpStatus.BadRequest);
    const selection = parsed.data;
    const result = services.insights.selection.request({ documentId, selection });
    if (result.outcome === SelectionRequestOutcome.TooSoon) return context.json({ error: SELECTION_SUMMARY_TOO_SOON_MESSAGE }, HttpStatus.TooManyRequests, { [RETRY_AFTER_HEADER]: String(result.retryAfterSeconds) });
    if (result.outcome === SelectionRequestOutcome.Unavailable) return context.json({ error: result.reason }, HttpStatus.ServiceUnavailable);
    if (result.outcome === SelectionRequestOutcome.Busy) return context.json({ error: LLM_BUSY_MESSAGE }, HttpStatus.ServiceUnavailable, { [RETRY_AFTER_HEADER]: String(BUSY_RETRY_AFTER_SECONDS) });
    const view = services.insights.selection.read({ documentId, selection });
    const isRunning = result.outcome === SelectionRequestOutcome.Started || result.outcome === SelectionRequestOutcome.AlreadyRunning;
    if (isRunning) return context.json(view, HttpStatus.Accepted);
    return context.json(view);
  });
  return routes;
}
