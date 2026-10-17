import type { DocumentTimeline, TimelineFilter } from '@superdoc-collab/types';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { pollWhileAvailable } from '@/lib/api';
import { fetchTimeline, TIMELINE_POLL_MS, timelineQueryKey } from './timeline-api';

export function useTimeline({
  documentId,
  filter,
  isOpen,
}: {
  documentId: string;
  filter: TimelineFilter;
  isOpen: boolean;
}): UseQueryResult<DocumentTimeline> {
  return useQuery({
    queryKey: timelineQueryKey({ documentId, filter }),
    queryFn: () => fetchTimeline({ documentId, filter }),
    enabled: isOpen,
    refetchInterval: pollWhileAvailable(TIMELINE_POLL_MS),
    placeholderData: keepPreviousData,
    retry: false,
  });
}
