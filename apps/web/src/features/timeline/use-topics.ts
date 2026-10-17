import { DocumentResource, type TopicStatus } from '@superdoc-history/types';
import { useEffect } from 'react';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/documents-api';
import { refreshTopics, summariesQueryKey, TopicsRefreshTooSoonError, topicsQueryKey } from './timeline-api';

export function useRefreshTopics(documentId: string): UseMutationResult<TopicStatus, Error, void> {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => refreshTopics(documentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...DOCUMENTS_QUERY_KEY, documentId, DocumentResource.Timeline] });
      await queryClient.invalidateQueries({ queryKey: topicsQueryKey(documentId) });
      await queryClient.invalidateQueries({ queryKey: summariesQueryKey(documentId) });
    },
  });
  const { error, reset } = mutation;

  useEffect(() => {
    if (!(error instanceof TopicsRefreshTooSoonError)) return;
    const timer = setTimeout(reset, error.retryAfterMs);
    return () => clearTimeout(timer);
  }, [error, reset]);

  return mutation;
}
