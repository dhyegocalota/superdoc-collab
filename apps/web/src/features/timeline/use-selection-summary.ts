import { SelectionSummaryState, type EditSelection, type SelectionSummaryView } from '@superdoc-collab/types';
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { pollWhileAvailable } from '@/lib/api';
import { useResetAfterRetry } from '@/lib/use-reset-after-retry';
import { fetchSelectionSummary, requestSelectionSummary, selectionSummaryQueryKey, TIMELINE_POLL_MS } from './timeline-api';

function pollWhileRunning(query: { state: { data: SelectionSummaryView | undefined; error: Error | null } }): number | false {
  if (query.state.data?.state !== SelectionSummaryState.Running) return false;
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
    refetchInterval: pollWhileRunning,
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

export function useSummarizeEdits({
  documentId,
  binMs,
  timeZone,
}: {
  documentId: string;
  binMs: number | null;
  timeZone: string;
}): UseMutationResult<SelectionSummaryView, Error, EditSelection> {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (selection: EditSelection) => requestSelectionSummary({ documentId, selection, binMs, timeZone }),
    onSuccess: async (view, selection) => {
      queryClient.setQueryData(selectionSummaryQueryKey({ documentId, selection, timeZone }), view);
      await queryClient.invalidateQueries({ queryKey: selectionSummaryQueryKey({ documentId, selection, timeZone }) });
    },
  });
  const { error, reset } = mutation;

  useResetAfterRetry({ error, reset });

  return mutation;
}
