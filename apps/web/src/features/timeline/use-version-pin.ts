import type { TimelineBin, VersionSummary } from '@superdoc-collab/types';
import { useEffect, useState } from 'react';
import { VersionLoadKind } from './timeline-api';
import { useVersionLoad } from './use-version-load';

type VersionPin = { at: number; sequence: number };

export type VersionPinState = {
  requestedSequence: number | null;
  shownVersion: VersionSummary | null;
  hasFailed: boolean;
  isRequestedFrameReady: boolean;
  reportFailure: (sequence: number) => void;
  reportReady: (sequence: number) => void;
};

function sequenceOf(bin: TimelineBin | undefined): number | null {
  if (!bin) return null;
  return bin.versionSequence;
}

function pinnedSequenceAt({ pin, at, sequence }: { pin: VersionPin | null; at: number | null; sequence: number | null }): number | null {
  if (pin === null || pin.at !== at) return null;
  if (sequence !== null && pin.sequence !== sequence) return null;
  return pin.sequence;
}

export function useVersionPin({
  documentId,
  at,
  sequence,
  bin,
}: {
  documentId: string;
  at: number | null;
  sequence: number | null;
  bin: TimelineBin | undefined;
}): VersionPinState {
  const [readyFrameSequence, setReadyFrameSequence] = useState<number | null>(null);
  const [loadedVersion, setLoadedVersion] = useState<VersionSummary | null>(null);
  const [failedFrameSequence, setFailedFrameSequence] = useState<number | null>(null);
  const [pinnedVersion, setPinnedVersion] = useState<VersionPin | null>(null);
  const binSequence = sequenceOf(bin);
  const requestedSequence = pinnedSequenceAt({ pin: pinnedVersion, at, sequence });
  const { version, isError } = useVersionLoad({ documentId, sequence: requestedSequence });
  const hasFailedFrame = requestedSequence !== null && failedFrameSequence === requestedSequence;
  const isShownFailed = loadedVersion !== null && loadedVersion.sequence === failedFrameSequence;

  useEffect(() => {
    if (version?.kind === VersionLoadKind.Ready) setLoadedVersion(version.version);
  }, [version]);

  useEffect(() => {
    const isAlreadyPinned = pinnedSequenceAt({ pin: pinnedVersion, at, sequence }) !== null;
    const hasBinWithoutVersion = bin !== undefined && binSequence === null;
    if (at === null) {
      setPinnedVersion(null);
      setLoadedVersion(null);
      setReadyFrameSequence(null);
      return;
    }
    if (isAlreadyPinned) return;
    if (sequence !== null) {
      setPinnedVersion({ at, sequence });
      return;
    }
    if (hasBinWithoutVersion) {
      setLoadedVersion(null);
      return;
    }
    if (binSequence === null) return;
    setPinnedVersion({ at, sequence: binSequence });
  }, [at, sequence, bin, binSequence, pinnedVersion]);

  useEffect(() => {
    setFailedFrameSequence(null);
  }, [at]);

  return {
    requestedSequence,
    shownVersion: at === null || isShownFailed ? null : loadedVersion,
    hasFailed: version?.kind === VersionLoadKind.Failed || isError || hasFailedFrame,
    isRequestedFrameReady: requestedSequence !== null && readyFrameSequence === requestedSequence,
    reportFailure: setFailedFrameSequence,
    reportReady: setReadyFrameSequence,
  };
}
