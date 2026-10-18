import { cellVolume } from '@superdoc-collab/history/timeline';
import type { DocumentTimeline } from '@superdoc-collab/types';

export type IdleBreak = { firstIndex: number; lastIndex: number; durationMs: number };
type EmptyRun = { firstIndex: number; lastIndex: number };

function isSilentBin({ timeline, index }: { timeline: DocumentTimeline; index: number }): boolean {
  const bin = timeline.bins[index]!;
  const isEmpty = timeline.bands.every((band) => cellVolume(bin.byBand[band.id]) === 0);
  const previousBin = timeline.bins[index - 1];
  const keepsVersion = previousBin === undefined || previousBin.versionSequence === bin.versionSequence;
  return isEmpty && keepsVersion;
}

function extendRuns({ runs, index }: { runs: EmptyRun[]; index: number }): EmptyRun[] {
  const lastRun = runs.at(-1);
  if (!lastRun || lastRun.lastIndex !== index - 1) return [...runs, { firstIndex: index, lastIndex: index }];
  return [...runs.slice(0, -1), { firstIndex: lastRun.firstIndex, lastIndex: index }];
}

export function idleBreaksOf({ timeline, thresholdMs }: { timeline: DocumentTimeline; thresholdMs: number }): IdleBreak[] {
  const lastBinIndex = timeline.bins.length - 1;
  return timeline.bins
    .map((_, index) => index)
    .filter((index) => isSilentBin({ timeline, index }))
    .reduce<EmptyRun[]>((runs, index) => extendRuns({ runs, index }), [])
    .filter((run) => run.firstIndex > 0 && run.lastIndex < lastBinIndex)
    .map((run) => ({ ...run, durationMs: timeline.bins[run.lastIndex]!.end - timeline.bins[run.firstIndex]!.start }))
    .filter((idleBreak) => idleBreak.durationMs > thresholdMs);
}

function idleBreakContaining({ breaks, index }: { breaks: IdleBreak[]; index: number }): IdleBreak | null {
  const idleBreak = breaks.find((candidate) => index >= candidate.firstIndex && index <= candidate.lastIndex);
  if (!idleBreak) return null;
  return idleBreak;
}

export function stepOutOfBreaks({ breaks, index, direction }: { breaks: IdleBreak[]; index: number; direction: 1 | -1 }): number {
  const idleBreak = idleBreakContaining({ breaks, index });
  if (!idleBreak) return index;
  if (direction === 1) return idleBreak.lastIndex + 1;
  return idleBreak.firstIndex - 1;
}
