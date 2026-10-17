import {
  DocumentResource,
  TimelineSearchParam,
  VersionViewerState,
  type EditRunView,
  type TimelineBin,
  type TimelineFilter,
  type VersionSummary,
  type DocumentTimeline,
} from '@superdoc-history/types';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useDebouncedCallback } from '@/lib/use-debounced-callback';
import { useEscapeKey } from '@/lib/use-escape-key';
import { binContaining } from './bin-containing';
import { binEditsQueryKey, fetchBinEdits, pollWhileAvailable, VersionLoadKind } from './timeline-api';
import { useTimeline } from './use-timeline';
import { useTimelineSearch } from './use-timeline-search';
import { useVersionLoad } from './use-version-load';

export const SCRUB_DEBOUNCE_MS = 300;
const NO_RUNS: EditRunView[] = [];
const NO_BIN_SEGMENT = 'no-bin';
const NO_BIN_EDITS_KEY = [DocumentResource.Timeline, NO_BIN_SEGMENT];

type VersionPin = { at: number; sequence: number };

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
  const isTextField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  return isTextField && target.value !== '';
}

function sequenceOf(bin: TimelineBin | undefined): number | null {
  if (!bin) return null;
  return bin.versionSequence;
}

function pinnedSequenceAt({ pin, at }: { pin: VersionPin | null; at: number | null }): number | null {
  if (pin === null || pin.at !== at) return null;
  return pin.sequence;
}

function useBinRuns({
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

export function useTimeTravel({ documentId, isEnabled }: { documentId: string; isEnabled: boolean }): TimeTravel {
  const { search, update } = useTimelineSearch();
  const at = search.at;
  const [pendingBinStart, setPendingBinStart] = useState<number | null>(null);
  const [shownVersion, setShownVersion] = useState<VersionSummary | null>(null);
  const [failedFrameSequence, setFailedFrameSequence] = useState<number | null>(null);
  const [pinned, setPinned] = useState<VersionPin | null>(null);
  const state = at === null ? VersionViewerState.Live : VersionViewerState.Viewing;
  const { data: timeline } = useTimeline({ documentId, filter: search.filter, isOpen: isEnabled && at !== null });
  const bin = binContaining({ timeline, time: at })?.bin;
  const binSequence = sequenceOf(bin);
  const requestedSequence = pinnedSequenceAt({ pin: pinned, at });
  const runs = useBinRuns({ documentId, timeline, bin, filter: search.filter });
  const { version, isError } = useVersionLoad({ documentId, sequence: requestedSequence });
  const hasFailedFrame = requestedSequence !== null && failedFrameSequence === requestedSequence;
  const hasFailed = version?.kind === VersionLoadKind.Failed || isError || hasFailedFrame;

  useEffect(() => {
    if (version?.kind === VersionLoadKind.Ready) setShownVersion(version.version);
  }, [version]);

  useEffect(() => {
    const isAlreadyPinned = pinnedSequenceAt({ pin: pinned, at }) !== null;
    const hasBinWithoutVersion = bin !== undefined && binSequence === null;
    if (at === null) {
      setPinned(null);
      setShownVersion(null);
      return;
    }
    if (isAlreadyPinned) return;
    if (hasBinWithoutVersion) {
      setShownVersion(null);
      return;
    }
    if (binSequence === null) return;
    setPinned({ at, sequence: binSequence });
  }, [at, bin, binSequence, pinned]);

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
  }, [at, cancel]);

  function travelTo(binStart: number): void {
    setPendingBinStart(binStart);
    schedule(binStart);
  }

  function backToLive(): void {
    cancel();
    setPendingBinStart(null);
    if (at === null) return;
    update({ changes: { [TimelineSearchParam.At]: null }, replace: false });
  }

  useEscapeKey({
    isEnabled: state === VersionViewerState.Viewing,
    onEscape: (event) => {
      if (isTypingInField(event.target)) return;
      backToLive();
    },
  });

  const requestedBinStart = pendingBinStart !== null ? pendingBinStart : at;
  const isShownFailed = shownVersion !== null && shownVersion.sequence === failedFrameSequence;

  return {
    state,
    requestedBinStart,
    requestedBinEnd: requestedBinStart !== null && timeline ? requestedBinStart + timeline.binMs : null,
    requestedSequence,
    shown: at === null || isShownFailed ? null : shownVersion,
    isLoading: state === VersionViewerState.Viewing && !hasFailed && version?.kind !== VersionLoadKind.Ready,
    hasFailed,
    runs,
    travelTo,
    backToLive,
    reportFailure: setFailedFrameSequence,
  };
}
