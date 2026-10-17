import { DocumentResource, TimelineSearchParam, VersionViewerState, type EditRunView, type TimelineBin, type TimelineFilter, type VersionSummary, type DocumentTimeline } from '@superdoc-history/types';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { KeyboardKey } from '@/lib/keyboard';
import { useDebouncedCallback } from '@/lib/use-debounced-callback';
import { binEditsQueryKey, fetchBinEdits, fetchVersion, pollWhileAvailable, versionQueryKey, VersionLoadKind } from './timeline-api';
import { useTimeline } from './use-timeline';
import { useTimelineSearch } from './use-timeline-search';

export const SCRUB_DEBOUNCE_MS = 300;
const NO_RUNS: EditRunView[] = [];
const NO_BIN_SEGMENT = 'no-bin';
const NO_BIN_EDITS_KEY = [DocumentResource.Timeline, NO_BIN_SEGMENT];

export type TimeTravel = {
  state: VersionViewerState;
  requestedBinStart: number | null;
  requestedBinEnd: number | null;
  requestedSequence: number | null;
  shown: VersionSummary | null;
  isLoading: boolean;
  hasFailed: boolean;
  runs: EditRunView[];
  travelTo: (binStart: number) => void;
  backToLive: () => void;
  reportFailure: (sequence: number) => void;
};

function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return false;
  return target.value !== '';
}

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
    refetchInterval: pollWhileAvailable,
    retry: false,
  });
  if (!data) return NO_RUNS;
  return data.runs;
}

export function useTimeTravel({ documentId, isEnabled }: { documentId: string; isEnabled: boolean }): TimeTravel {
  const { search, update } = useTimelineSearch();
  const [pendingBinStart, setPendingBinStart] = useState<number | null>(null);
  const [shownVersion, setShownVersion] = useState<VersionSummary | null>(null);
  const [failedFrameSequence, setFailedFrameSequence] = useState<number | null>(null);
  const state = search.at === null ? VersionViewerState.Live : VersionViewerState.Viewing;
  const { data: timeline } = useTimeline({ documentId, filter: search.filter, isOpen: isEnabled && search.at !== null });
  const bin = binContaining({ timeline, time: search.at });
  const binSequence = sequenceOf(bin);
  const [pinned, setPinned] = useState<{ at: number; sequence: number } | null>(null);
  const requestedSequence = pinned !== null && pinned.at === search.at ? pinned.sequence : null;
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
  const hasFailedFrame = requestedSequence !== null && failedFrameSequence === requestedSequence;
  const hasFailed = version?.kind === VersionLoadKind.Failed || isError || hasFailedFrame;

  useEffect(() => {
    if (version?.kind === VersionLoadKind.Ready) setShownVersion(version.version);
  }, [version]);

  useEffect(() => {
    if (search.at === null) {
      setPinned(null);
      setShownVersion(null);
      return;
    }
    if (pinned !== null && pinned.at === search.at) return;
    if (binSequence === null) {
      if (bin) setShownVersion(null);
      return;
    }
    setPinned({ at: search.at, sequence: binSequence });
  }, [search.at, bin, binSequence, pinned]);

  const { schedule, cancel } = useDebouncedCallback({
    callback: (binStart: number) => {
      update({ changes: { [TimelineSearchParam.At]: String(binStart) }, replace: state === VersionViewerState.Viewing });
      setPendingBinStart(null);
    },
    delayMs: SCRUB_DEBOUNCE_MS,
  });

  useEffect(() => {
    cancel();
    setPendingBinStart(null);
    setFailedFrameSequence(null);
  }, [search.at, cancel]);

  function travelTo(binStart: number): void {
    setPendingBinStart(binStart);
    schedule(binStart);
  }

  function backToLive(): void {
    cancel();
    setPendingBinStart(null);
    if (search.at === null) return;
    update({ changes: { [TimelineSearchParam.At]: null }, replace: false });
  }

  const backToLiveRef = useRef(backToLive);

  useEffect(() => {
    backToLiveRef.current = backToLive;
  });

  useEffect(() => {
    if (state !== VersionViewerState.Viewing) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== KeyboardKey.Escape || event.defaultPrevented || isTypingInField(event.target)) return;
      backToLiveRef.current();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state]);

  const requestedBinStart = pendingBinStart !== null ? pendingBinStart : search.at;
  const isShownFailed = shownVersion !== null && shownVersion.sequence === failedFrameSequence;

  return {
    state,
    requestedBinStart,
    requestedBinEnd: requestedBinStart !== null && timeline ? requestedBinStart + timeline.binMs : null,
    requestedSequence,
    shown: search.at === null || isShownFailed ? null : shownVersion,
    isLoading: state === VersionViewerState.Viewing && !hasFailed && version?.kind !== VersionLoadKind.Ready,
    hasFailed,
    runs,
    travelTo,
    backToLive,
    reportFailure: setFailedFrameSequence,
  };
}
