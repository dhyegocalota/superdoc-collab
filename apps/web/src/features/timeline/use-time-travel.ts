import { TimelineSearchParam, VersionViewerState, type EditRunView, type VersionSummary } from '@superdoc-collab/types';
import { useEffect, useState } from 'react';
import { isTypingInField } from '@/lib/keyboard';
import { useDebouncedCallback } from '@/lib/use-debounced-callback';
import { useEscapeKey } from '@/lib/use-escape-key';
import { useIsPhoneLayout } from '@/lib/use-is-phone-layout';
import { binContaining } from './bin-containing';
import { useBinRuns } from './use-bin-runs';
import { useTimeline } from './use-timeline';
import { useTimelineSearch } from './use-timeline-search';
import { useVersionPin } from './use-version-pin';

export const SCRUB_DEBOUNCE_MS = 300;

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

export function useTimeTravel({ documentId, isEnabled }: { documentId: string; isEnabled: boolean }): TimeTravel {
  const { search, update } = useTimelineSearch();
  const at = search.at;
  const isPhoneLayout = useIsPhoneLayout();
  const [pendingBinStart, setPendingBinStart] = useState<number | null>(null);
  const state = at === null ? VersionViewerState.Live : VersionViewerState.Viewing;
  const { data: timeline } = useTimeline({ documentId, filter: search.filter, isOpen: isEnabled && at !== null });
  const bin = binContaining({ timeline, time: at })?.bin;
  const runs = useBinRuns({ documentId, timeline, bin, filter: search.filter });
  const versionPin = useVersionPin({ documentId, at, sequence: search.sequence, bin });

  function writeAt(binStart: number): void {
    update({
      changes: { [TimelineSearchParam.At]: String(binStart), [TimelineSearchParam.Sequence]: null },
      replace: state === VersionViewerState.Viewing,
    });
  }

  const { schedule, cancel } = useDebouncedCallback({
    callback: (binStart: number) => {
      writeAt(binStart);
      setPendingBinStart(null);
    },
    delayMs: SCRUB_DEBOUNCE_MS,
  });

  useEffect(() => {
    cancel();
    setPendingBinStart(null);
  }, [at, cancel]);

  function startTravel(binStart: number): void {
    setPendingBinStart(binStart);
    schedule(binStart);
  }

  function travelNow(binStart: number): void {
    cancel();
    writeAt(binStart);
  }

  function travelTo(binStart: number): void {
    if (isPhoneLayout) return travelNow(binStart);
    startTravel(binStart);
  }

  function backToLive(): void {
    cancel();
    setPendingBinStart(null);
    if (at === null) return;
    update({ changes: { [TimelineSearchParam.At]: null, [TimelineSearchParam.Sequence]: null }, replace: false });
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

  return {
    state,
    requestedBinStart,
    requestedBinEnd: requestedBin ? requestedBin.end : null,
    requestedSequence: versionPin.requestedSequence,
    shownVersion: versionPin.shownVersion,
    isLoading: state === VersionViewerState.Viewing && !versionPin.hasFailed && !versionPin.isRequestedFrameReady,
    hasFailed: versionPin.hasFailed,
    runs,
    travelTo,
    backToLive,
    reportFailure: versionPin.reportFailure,
    reportReady: versionPin.reportReady,
  };
}
