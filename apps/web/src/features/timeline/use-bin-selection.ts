import type { DocumentTimeline, TimelineBin } from '@superdoc-history/types';

export type BinSelection = {
  selectedIndex: number | null;
  selectedBin: TimelineBin | null;
  selectIndex: (index: number) => void;
  clearSelection: () => void;
};

export function useBinSelection({
  timeline,
  at,
  onTravel,
  onBackToLive,
}: {
  timeline: DocumentTimeline | undefined;
  at: number | null;
  onTravel: (binStart: number) => void;
  onBackToLive: () => void;
}): BinSelection {
  return { selectedIndex: null, selectedBin: null, selectIndex: () => undefined, clearSelection: () => undefined };
}
