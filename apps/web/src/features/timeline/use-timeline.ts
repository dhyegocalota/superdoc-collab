import type { DocumentTimeline, TimelineFilter } from '@superdoc-collab/types';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { pollWhileAvailable } from '@/lib/api';
import { useTimeZone } from '@/lib/use-time-zone';
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
  const { timeZone } = useTimeZone();
  return useQuery({
    queryKey: timelineQueryKey({ documentId, filter, timeZone }),
    queryFn: () => fetchTimeline({ documentId, filter, timeZone }),
    enabled: isOpen,
    refetchInterval: pollWhileAvailable(TIMELINE_POLL_MS),
    placeholderData: keepPreviousData,
    retry: false,
  });
}
