import { DocumentResource, VersionViewerState, type EditRunView, type TimelineBin, type TimelineFilter, type VersionSummary, type DocumentTimeline } from '@superdoc-history/types';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useDebouncedCallback } from '@/lib/use-debounced-callback';
import { binEditsQueryKey, fetchBinEdits, fetchVersion, TIMELINE_POLL_MS, versionQueryKey, VersionLoadKind } from './timeline-api';
import { useTimeline } from './use-timeline';
import { useTimelineSearch } from './use-timeline-search';

export const SCRUB_DEBOUNCE_MS = 300;
const NO_RUNS: EditRunView[] = [];
const NO_BIN_EDITS_KEY = [DocumentResource.Timeline, 'no-bin'];

export type TimeTravel = {
  state: VersionViewerState;
  requestedBinStart: number | null;
  requestedSequence: number | null;
  shown: VersionSummary | null;
  isLoading: boolean;
  hasFailed: boolean;
  runs: EditRunView[];
  travelTo: (binStart: number) => void;
  backToLive: () => void;
};

function binContaining({ timeline, time }: { timeline: DocumentTimeline | undefined; time: number | null }): TimelineBin | undefined {
  if (!timeline || time === null) return undefined;
  return timeline.bins.find((bin) => time >= bin.start && time < bin.start + timeline.binMs);
}

function sequenceOf(bin: TimelineBin | undefined): number | null {
  if (!bin) return null;
  return bin.versionSequence;
}

function useBinRuns({ documentId, timeline, bin, filter }: { documentId: string; timeline: DocumentTimeline | undefined; bin: TimelineBin | undefined; filter: TimelineFilter }): EditRunView[] {
  const request = bin && timeline ? { documentId, binStart: bin.start, binMs: timeline.binMs, filter } : null;
  const { data } = useQuery({
    queryKey: request ? binEditsQueryKey(request) : NO_BIN_EDITS_KEY,
    queryFn: request ? () => fetchBinEdits(request) : skipToken,
    refetchInterval: TIMELINE_POLL_MS,
    retry: false,
  });
  if (!data) return NO_RUNS;
  return data.runs;
}

export function useTimeTravel({ documentId, isEnabled }: { documentId: string; isEnabled: boolean }): TimeTravel {
  const { search, update } = useTimelineSearch();
  const [pendingBinStart, setPendingBinStart] = useState<number | null>(null);
  const [shownVersion, setShownVersion] = useState<VersionSummary | null>(null);
  const state = search.at === null ? VersionViewerState.Live : VersionViewerState.Viewing;
  const { data: timeline } = useTimeline({ documentId, filter: search.filter, isOpen: isEnabled && search.at !== null });
  const bin = binContaining({ timeline, time: search.at });
  const requestedSequence = sequenceOf(bin);
  const runs = useBinRuns({ documentId, timeline, bin, filter: search.filter });
  const { data: version, isError } = useQuery({
    queryKey: versionQueryKey({ documentId, sequence: requestedSequence }),
    queryFn: requestedSequence === null ? skipToken : () => fetchVersion({ documentId, sequence: requestedSequence }),
    staleTime: (query) => (query.state.data?.kind === VersionLoadKind.Ready ? Infinity : 0),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.kind !== VersionLoadKind.Pending) return false;
      return data.retryAfterMs;
    },
    retry: false,
  });
  const hasFailed = version?.kind === VersionLoadKind.Failed || isError;

  useEffect(() => {
    if (version?.kind === VersionLoadKind.Ready) setShownVersion(version.version);
  }, [version]);

  useEffect(() => {
    if (search.at === null) setShownVersion(null);
  }, [search.at]);

  const commit = useDebouncedCallback({
    callback: (binStart: number) => {
      update({ changes: { at: String(binStart) }, replace: state === VersionViewerState.Viewing });
      setPendingBinStart(null);
    },
    delayMs: SCRUB_DEBOUNCE_MS,
  });

  function travelTo(binStart: number): void {
    setPendingBinStart(binStart);
    commit(binStart);
  }

  function backToLive(): void {
    setPendingBinStart(null);
    update({ changes: { at: null }, replace: false });
  }

  return {
    state,
    requestedBinStart: pendingBinStart !== null ? pendingBinStart : search.at,
    requestedSequence,
    shown: search.at === null ? null : shownVersion,
    isLoading: requestedSequence !== null && !hasFailed && version?.kind !== VersionLoadKind.Ready,
    hasFailed,
    runs,
    travelTo,
    backToLive,
  };
}
