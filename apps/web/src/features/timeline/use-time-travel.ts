import { TimelineSearchParam, VersionViewerState, type EditRunView, type TimelineBin, type VersionSummary } from '@superdoc-collab/types';
import { useEffect, useState } from 'react';
import { LARGE_BREAKPOINT_PX } from '@/lib/breakpoints';
import { isTypingInField } from '@/lib/keyboard';
import { useDebouncedCallback } from '@/lib/use-debounced-callback';
import { useEscapeKey } from '@/lib/use-escape-key';
import { useMinWidth } from '@/lib/use-min-width';
import { binContaining } from './bin-containing';
import { VersionLoadKind } from './timeline-api';
import { useBinRuns } from './use-bin-runs';
import { useTimeline } from './use-timeline';
import { useTimelineSearch } from './use-timeline-search';
import { useVersionLoad } from './use-version-load';

export const SCRUB_DEBOUNCE_MS = 300;

type VersionPin = { at: number; sequence: number };

export type TimeTravel = {
  state: VersionViewerState;
  requestedBinStart: number | null;
  requestedBinEnd: number | null;
  requestedSequence: number | null;
  shownVersion: VersionSummary | null;
  isLoading: boolean;
  hasFailed: boolean;
  runs: EditRunView[];
  travelTo: (binStart: number) => void;
  backToLive: () => void;
  reportFailure: (sequence: number) => void;
  reportReady: (sequence: number) => void;
};

function sequenceOf(bin: TimelineBin | undefined): number | null {
  if (!bin) return null;
  return bin.versionSequence;
}

function pinnedSequenceAt({ pin, at }: { pin: VersionPin | null; at: number | null }): number | null {
  if (pin === null || pin.at !== at) return null;
  return pin.sequence;
}

export function useTimeTravel({ documentId, isEnabled }: { documentId: string; isEnabled: boolean }): TimeTravel {
  const { search, update } = useTimelineSearch();
  const at = search.at;
  const isPhoneLayout = !useMinWidth(LARGE_BREAKPOINT_PX);
  const [pendingBinStart, setPendingBinStart] = useState<number | null>(null);
  const [readyFrameSequence, setReadyFrameSequence] = useState<number | null>(null);
  const [shownVersion, setShownVersion] = useState<VersionSummary | null>(null);
  const [failedFrameSequence, setFailedFrameSequence] = useState<number | null>(null);
  const [pinnedVersion, setPinnedVersion] = useState<VersionPin | null>(null);
  const state = at === null ? VersionViewerState.Live : VersionViewerState.Viewing;
  const { data: timeline } = useTimeline({ documentId, filter: search.filter, isOpen: isEnabled && at !== null });
  const bin = binContaining({ timeline, time: at })?.bin;
  const binSequence = sequenceOf(bin);
  const requestedSequence = pinnedSequenceAt({ pin: pinnedVersion, at });
  const runs = useBinRuns({ documentId, timeline, bin, filter: search.filter });
  const { version, isError } = useVersionLoad({ documentId, sequence: requestedSequence });
  const hasFailedFrame = requestedSequence !== null && failedFrameSequence === requestedSequence;
  const hasFailed = version?.kind === VersionLoadKind.Failed || isError || hasFailedFrame;

  useEffect(() => {
    if (version?.kind === VersionLoadKind.Ready) setShownVersion(version.version);
  }, [version]);

  useEffect(() => {
    const isAlreadyPinned = pinnedSequenceAt({ pin: pinnedVersion, at }) !== null;
    const hasBinWithoutVersion = bin !== undefined && binSequence === null;
    if (at === null) {
      setPinnedVersion(null);
      setShownVersion(null);
      setReadyFrameSequence(null);
      return;
    }
    if (isAlreadyPinned) return;
    if (hasBinWithoutVersion) {
      setShownVersion(null);
      return;
    }
    if (binSequence === null) return;
    setPinnedVersion({ at, sequence: binSequence });
  }, [at, bin, binSequence, pinnedVersion]);

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

  function startTravel(binStart: number): void {
    setPendingBinStart(binStart);
    schedule(binStart);
  }

  function travelNow(binStart: number): void {
    cancel();
    update({ changes: { [TimelineSearchParam.At]: String(binStart) }, replace: state === VersionViewerState.Viewing });
  }

  function travelTo(binStart: number): void {
    if (isPhoneLayout) return travelNow(binStart);
    startTravel(binStart);
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
  const requestedBin = timeline?.bins.find((candidate) => candidate.start === requestedBinStart);
  const isRequestedFrameReady = requestedSequence !== null && readyFrameSequence === requestedSequence;
  const isShownFailed = shownVersion !== null && shownVersion.sequence === failedFrameSequence;

  return {
    state,
    requestedBinStart,
    requestedBinEnd: requestedBin ? requestedBin.end : null,
    requestedSequence,
    shownVersion: at === null || isShownFailed ? null : shownVersion,
    isLoading: state === VersionViewerState.Viewing && !hasFailed && !isRequestedFrameReady,
    hasFailed,
    runs,
    travelTo,
    backToLive,
    reportFailure: setFailedFrameSequence,
    reportReady: setReadyFrameSequence,
  };
}
