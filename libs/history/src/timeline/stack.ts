import type { TimelineBand, TimelineBin, TimelineCell } from '@superdoc-history/types';

export const TOPIC_HUE_START = 205;
export const TOPIC_HUE_END = 25;

export type StackRow = { start: number; values: Record<string, number> };

function cellVolume(cell: TimelineCell | undefined): number {
  if (!cell) return 0;
  return cell.inserted + cell.deleted;
}

export function toStackRows({ bins, bandIds }: { bins: TimelineBin[]; bandIds: string[] }): StackRow[] {
  return bins.map((bin) => ({
    start: bin.start,
    values: Object.fromEntries(bandIds.map((bandId) => [bandId, cellVolume(bin.byBand[bandId])])),
  }));
}

export function huesByOnset(bands: Pick<TimelineBand, 'id' | 'onsetTime'>[]): Map<string, number> {
  const ordered = [...bands].sort((left, right) => left.onsetTime - right.onsetTime);
  const steps = Math.max(1, ordered.length - 1);
  return new Map(ordered.map((band, index) => [band.id, TOPIC_HUE_START + ((TOPIC_HUE_END - TOPIC_HUE_START) * index) / steps]));
}
