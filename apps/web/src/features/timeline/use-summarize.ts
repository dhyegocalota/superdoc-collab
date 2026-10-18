import { secondsRoundedUp, type EditSelection, type SummarizeOutcome, type SummarizeResponse } from '@superdoc-collab/types';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RetryLaterError } from '@/lib/api';
import { isSummarizing, pollWhileSummarizing } from './use-selection-summary';
import { useResetAfterRetry } from '@/lib/use-reset-after-retry';
import { useTimeZone } from '@/lib/use-time-zone';
import { fetchSelectionSummary, requestSelectionSummary, selectionSummaryQueryKey } from './timeline-api';
import { useTimeline } from './use-timeline';
import { useTimelineSearch } from './use-timeline-search';

export type SummarizeControl = {
  summarize: () => void;
  isRunning: boolean;
  outcome: SummarizeOutcome | null;
  error: Error | null;
  retryAfterSeconds: number | null;
  showSelection: (selection: EditSelection) => void;
};

export function useSummarize({ documentId }: { documentId: string }): SummarizeControl {
  const queryClient = useQueryClient();
  const { search } = useTimelineSearch();
  const { timeZone: preferredTimeZone } = useTimeZone();
  const { data: timeline } = useTimeline({ documentId, filter: search.filter, isOpen: false });
  const binMs = timeline ? timeline.binMs : null;
  const timeZone = timeline ? timeline.timeZone : preferredTimeZone;
  const [shownSelection, showSelection] = useState<EditSelection | null>(null);
  const urlSelection: EditSelection = { term: search.filter.term, author: search.filter.author, topic: search.topic, at: search.at };
  const selection = shownSelection === null ? urlSelection : shownSelection;
  const queryKey = selectionSummaryQueryKey({ documentId, selection, timeZone });
  const { data: view } = useQuery({
    queryKey,
    queryFn: () => fetchSelectionSummary({ documentId, selection, binMs, timeZone }),
    enabled: isSummarizing(queryClient.getQueryData<SummarizeResponse>(queryKey)),
    refetchInterval: pollWhileSummarizing,
  });
  const mutation = useMutation({
    mutationFn: () => requestSelectionSummary({ documentId, selection, binMs, timeZone }),
    onSuccess: async (response) => {
      queryClient.setQueryData(queryKey, response);
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const { error, reset } = mutation;

  const selectionKey = JSON.stringify(queryKey);

  useEffect(() => {
    reset();
  }, [selectionKey, reset]);

  useResetAfterRetry({ error, reset });

  const isPolledRunning = isSummarizing(view);
  return {
    summarize: () => mutation.mutate(),
    isRunning: mutation.isPending || isPolledRunning,
    outcome: mutation.data ? mutation.data.outcome : null,
    error,
    showSelection,
    retryAfterSeconds: error instanceof RetryLaterError ? secondsRoundedUp(error.retryAfterMs) : null,
  };
}
