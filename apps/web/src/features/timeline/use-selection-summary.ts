import type { EditSelection, SelectionSummaryView } from '@superdoc-history/types';
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { fetchSelectionSummary, requestSelectionSummary, selectionSummaryQueryKey, TIMELINE_POLL_MS } from './timeline-api';

export function useSelectionSummary({ documentId, selection, isOpen }: { documentId: string; selection: EditSelection; isOpen: boolean }): UseQueryResult<SelectionSummaryView> {
  return useQuery({
    queryKey: selectionSummaryQueryKey({ documentId, selection }),
    queryFn: () => fetchSelectionSummary({ documentId, selection }),
    enabled: isOpen,
    refetchInterval: TIMELINE_POLL_MS,
    retry: false,
  });
}

export function useSummarizeEdits(documentId: string): UseMutationResult<SelectionSummaryView, Error, EditSelection> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (selection: EditSelection) => requestSelectionSummary({ documentId, selection }),
    onSuccess: async (view, selection) => {
      queryClient.setQueryData(selectionSummaryQueryKey({ documentId, selection }), view);
      await queryClient.invalidateQueries({ queryKey: selectionSummaryQueryKey({ documentId, selection }) });
    },
  });
}
