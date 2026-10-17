import type { DocumentTimeline, TimelineBin } from '@superdoc-history/types';
import { useEffect, useState } from 'react';
import { binContaining } from './bin-containing';

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
  const [selectedTime, setSelectedTime] = useState<number | null>(at);
  const selected = binContaining({ timeline, time: selectedTime });

  useEffect(() => {
    setSelectedTime(at);
  }, [at]);

  function selectIndex(index: number): void {
    const bin = timeline!.bins[index]!;
    setSelectedTime(bin.start);
    if (bin.versionSequence !== null) onTravel(bin.start);
  }

  function clearSelection(): void {
    setSelectedTime(null);
    onBackToLive();
  }

  if (selected === null) return { selectedIndex: null, selectedBin: null, selectIndex, clearSelection };
  return { selectedIndex: selected.index, selectedBin: selected.bin, selectIndex, clearSelection };
}
