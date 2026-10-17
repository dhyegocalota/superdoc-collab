import type { DocumentTopics } from '@superdoc-collab/types';
import type { AppServices } from '../http/app';

export function documentTopics({ services, documentId }: { services: AppServices; documentId: string }): DocumentTopics {
  const topics = services.insightsRepository
    .topics(documentId)
    .map((topic) => ({ id: topic.id, name: topic.name, blockCount: topic.blockIds.length }));
  return { status: services.insights.topics.status(documentId), topics };
}
