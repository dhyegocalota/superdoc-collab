import type { DocumentTimeline, TimelineBin } from '@superdoc-collab/types';

export type IndexedBin = { index: number; bin: TimelineBin };

export function binContaining({ timeline, time }: { timeline: DocumentTimeline | undefined; time: number | null }): IndexedBin | null {
  if (!timeline || time === null) return null;
  const index = timeline.bins.findIndex((bin) => time >= bin.start && time < bin.start + timeline.binMs);
  if (index < 0) return null;
  return { index, bin: timeline.bins[index]! };
}
