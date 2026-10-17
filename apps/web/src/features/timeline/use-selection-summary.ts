import { SECOND_MS, SelectionSummaryState, type EditSelection, type SelectionSummaryView } from '@superdoc-history/types';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { DocumentUnavailableError } from '@/features/editor/editor-api';
import { fetchSelectionSummary, requestSelectionSummary, selectionSummaryQueryKey, SummaryTooSoonError, TIMELINE_POLL_MS } from './timeline-api';

function pollWhileRunning(query: { state: { data: SelectionSummaryView | undefined; error: Error | null } }): number | false {
  if (query.state.error instanceof DocumentUnavailableError) return false;
  if (query.state.data?.state === SelectionSummaryState.Running) return TIMELINE_POLL_MS;
  return false;
}

export function useSelectionSummary({ documentId, selection, isOpen }: { documentId: string; selection: EditSelection; isOpen: boolean }): UseQueryResult<SelectionSummaryView> {
  return useQuery({
    queryKey: selectionSummaryQueryKey({ documentId, selection }),
    queryFn: () => fetchSelectionSummary({ documentId, selection }),
    enabled: isOpen,
    refetchInterval: pollWhileRunning,
    retry: false,
  });
}

export function useSummarizeEdits(documentId: string): UseMutationResult<SelectionSummaryView, Error, EditSelection> {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (selection: EditSelection) => requestSelectionSummary({ documentId, selection }),
    onSuccess: async (view, selection) => {
      queryClient.setQueryData(selectionSummaryQueryKey({ documentId, selection }), view);
      await queryClient.invalidateQueries({ queryKey: selectionSummaryQueryKey({ documentId, selection }) });
    },
  });
  const { error, reset } = mutation;

  useEffect(() => {
    if (!(error instanceof SummaryTooSoonError)) return;
    const timer = setTimeout(reset, error.retryAfterSeconds * SECOND_MS);
    return () => clearTimeout(timer);
  }, [error, reset]);

  return mutation;
}
