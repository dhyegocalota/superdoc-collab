import { DocumentResource, type DocumentTimeline, type EditRunView, type TimelineBin, type TimelineFilter } from '@superdoc-history/types';
import { skipToken, useQuery } from '@tanstack/react-query';
import { binEditsQueryKey, fetchBinEdits, pollWhileAvailable } from './timeline-api';

const NO_RUNS: EditRunView[] = [];
const NO_BIN_SEGMENT = 'no-bin';
const NO_BIN_EDITS_KEY = [DocumentResource.Timeline, NO_BIN_SEGMENT];

export function useBinRuns({
  documentId,
  timeline,
  bin,
  filter,
}: {
  documentId: string;
  timeline: DocumentTimeline | undefined;
  bin: TimelineBin | undefined;
  filter: TimelineFilter;
}): EditRunView[] {
  const request = bin && timeline ? { documentId, binStart: bin.start, binMs: timeline.binMs, filter } : null;
  const { data } = useQuery({
    queryKey: request ? binEditsQueryKey(request) : NO_BIN_EDITS_KEY,
    queryFn: request ? () => fetchBinEdits(request) : skipToken,
    refetchInterval: pollWhileAvailable,
    retry: false,
  });
  if (!data) return NO_RUNS;
  return data.runs;
}
