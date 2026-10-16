import { DocumentResource, type TopicStatus } from '@superdoc-history/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/documents-api';
import { refreshTopics, topicsQueryKey } from './timeline-api';

export function useRefreshTopics(documentId: string): UseMutationResult<TopicStatus, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => refreshTopics(documentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...DOCUMENTS_QUERY_KEY, documentId, DocumentResource.Timeline] });
      await queryClient.invalidateQueries({ queryKey: topicsQueryKey(documentId) });
    },
  });
}
