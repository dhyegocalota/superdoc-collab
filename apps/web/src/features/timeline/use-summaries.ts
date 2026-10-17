import type { TopicSummaries } from '@superdoc-history/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchSummaries, summariesQueryKey, pollWhileAvailable } from './timeline-api';

export function useSummaries({ documentId, isOpen }: { documentId: string; isOpen: boolean }): UseQueryResult<TopicSummaries> {
  return useQuery({
    queryKey: summariesQueryKey(documentId),
    queryFn: () => fetchSummaries(documentId),
    enabled: isOpen,
    refetchInterval: pollWhileAvailable,
    retry: false,
  });
}
