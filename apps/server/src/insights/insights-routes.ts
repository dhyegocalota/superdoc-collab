import { DocumentRole, HttpStatus, TOPICS_REFRESH_TOO_SOON_MESSAGE, type DocumentTopics } from '@superdoc-history/types';
import { Hono } from 'hono';
import { requireDocumentRole } from '../documents/require-document-role';
import type { AppServices } from '../http/app';
import type { SignedIn } from '../http/require-user';
import { RefreshOutcome } from './topics-service';

const RETRY_AFTER_HEADER = 'Retry-After';

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
  return routes;
}
