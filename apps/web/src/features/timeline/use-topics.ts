import { DocumentResource, type TopicStatus } from '@superdoc-history/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { documentQueryKey } from '@/features/documents/documents-api';
import { useResetAfterRetry } from '@/lib/use-reset-after-retry';
import { refreshTopics, summariesQueryKey, topicsQueryKey } from './timeline-api';

export function useRefreshTopics(documentId: string): UseMutationResult<TopicStatus, Error, void> {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => refreshTopics(documentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: documentQueryKey({ documentId, segments: [DocumentResource.Timeline] }) });
      await queryClient.invalidateQueries({ queryKey: topicsQueryKey(documentId) });
      await queryClient.invalidateQueries({ queryKey: summariesQueryKey(documentId) });
    },
  });
  const { error, reset } = mutation;

  useResetAfterRetry({ error, reset });

  return mutation;
}
