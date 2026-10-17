import type { DocumentTimeline, TimelineBin } from '@superdoc-history/types';

export type IndexedBin = { index: number; bin: TimelineBin };

export function binContaining({ timeline, time }: { timeline: DocumentTimeline | undefined; time: number | null }): IndexedBin | null {
  return null;
}
