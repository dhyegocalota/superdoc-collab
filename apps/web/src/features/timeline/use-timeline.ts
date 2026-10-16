import type { DocumentTimeline, TimelineFilter } from '@superdoc-history/types';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchTimeline, TIMELINE_POLL_MS, timelineQueryKey } from './timeline-api';

export function useTimeline({ documentId, filter, isOpen }: { documentId: string; filter: TimelineFilter; isOpen: boolean }): UseQueryResult<DocumentTimeline> {
  return useQuery({
    queryKey: timelineQueryKey({ documentId, filter }),
    queryFn: () => fetchTimeline({ documentId, filter }),
    enabled: isOpen,
    refetchInterval: TIMELINE_POLL_MS,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
