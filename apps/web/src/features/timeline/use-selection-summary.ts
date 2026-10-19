import {
  SelectionSummaryState,
  SUMMARY_RUNNING_POLL_MS,
  SummarizeStep,
  type EditSelection,
  type SelectionSummaryView,
} from '@superdoc-collab/types';
import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { pollWhileAvailable } from '@/lib/api';
import { fetchSelectionSummary, selectionSummaryQueryKey } from './timeline-api';

export function isSummarizing(view: SelectionSummaryView | undefined): boolean {
  if (view === undefined) return false;
  return view.state === SelectionSummaryState.Running || view.step !== SummarizeStep.Idle;
}

export function pollWhileSummarizing(query: { state: { data: SelectionSummaryView | undefined; error: Error | null } }): number | false {
  if (!isSummarizing(query.state.data)) return false;
  return pollWhileAvailable(SUMMARY_RUNNING_POLL_MS)(query);
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
