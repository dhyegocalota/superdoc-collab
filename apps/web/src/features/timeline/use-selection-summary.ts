import { SelectionSummaryState, SummarizeStep, type EditSelection, type SelectionSummaryView } from '@superdoc-collab/types';
import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { pollWhileAvailable } from '@/lib/api';
import { fetchSelectionSummary, selectionSummaryQueryKey, TIMELINE_POLL_MS } from './timeline-api';

function pollWhileSummarizing(query: { state: { data: SelectionSummaryView | undefined; error: Error | null } }): number | false {
  const view = query.state.data;
  if (view === undefined) return false;
  const isSummarizing = view.state === SelectionSummaryState.Running || view.step !== SummarizeStep.Idle;
  if (!isSummarizing) return false;
  return pollWhileAvailable(TIMELINE_POLL_MS)(query);
}

export function useSelectionSummary({
  documentId,
  selection,
  binMs,
  timeZone,
  isOpen,
  timelineStamp,
}: {
  documentId: string;
  selection: EditSelection;
  binMs: number | null;
  timeZone: string;
  isOpen: boolean;
  timelineStamp: string | null;
}): UseQueryResult<SelectionSummaryView> {
  const queryClient = useQueryClient();
  const seenStamp = useRef(timelineStamp);
  const query = useQuery({
    queryKey: selectionSummaryQueryKey({ documentId, selection, timeZone }),
    queryFn: () => fetchSelectionSummary({ documentId, selection, binMs, timeZone }),
    enabled: isOpen,
    refetchInterval: pollWhileSummarizing,
    retry: false,
  });

  useEffect(() => {
    const previousStamp = seenStamp.current;
    seenStamp.current = timelineStamp;
    if (previousStamp === null || timelineStamp === null || previousStamp === timelineStamp) return;
    void queryClient.invalidateQueries({ queryKey: selectionSummaryQueryKey({ documentId, selection, timeZone }) });
  }, [timelineStamp]);

  return query;
}
