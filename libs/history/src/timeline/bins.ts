import { MINUTE_MS, SECOND_MS, type TimelineBin, type TimelineCell } from '@superdoc-collab/types';
import type { EditRun } from './runs';

// NB ADR 0016: the bin cap keeps the streamgraph re-render inside its 16 ms budget; a span picks the finest ladder step that fits.
export const MAX_BINS = 120;
const EDGE_BINS = 1;
const COVERING_EXTRA_BINS = 2 * EDGE_BINS + 1;
const WEEK_MS = 10_080 * MINUTE_MS;
const SUB_MINUTE_BINS_MS = [10 * SECOND_MS, 30 * SECOND_MS];
const BIN_LADDER_MINUTES = [1, 2, 5, 10, 15, 30, 60, 180, 360, 720, 1440];
export const BIN_LADDER_MS = [...SUB_MINUTE_BINS_MS, ...BIN_LADDER_MINUTES.map((minutes) => minutes * MINUTE_MS), WEEK_MS];

export function chooseBinMs(spanMs: number): number {
  const fitting = BIN_LADDER_MS.find((binMs) => Math.ceil(spanMs / binMs) + COVERING_EXTRA_BINS <= MAX_BINS);
  if (fitting) return fitting;
  return Math.ceil(spanMs / (MAX_BINS - COVERING_EXTRA_BINS) / WEEK_MS) * WEEK_MS;
}

export function binStartOf({ time, binMs }: { time: number; binMs: number }): number {
  return Math.floor(time / binMs) * binMs;
}

export function binStartsCovering({ firstTime, lastTime, binMs }: { firstTime: number; lastTime: number; binMs: number }): number[] {
  const first = binStartOf({ time: firstTime, binMs }) - EDGE_BINS * binMs;
  const last = binStartOf({ time: lastTime, binMs }) + EDGE_BINS * binMs;
  return Array.from({ length: (last - first) / binMs + 1 }, (_, index) => first + index * binMs);
}

function mergeCell({ cell, run }: { cell: TimelineCell | undefined; run: EditRun }): TimelineCell {
  if (!cell) return { inserted: run.inserted.length, deleted: run.deleted.length, authorKeys: run.authorKeys };
  return {
    inserted: cell.inserted + run.inserted.length,
    deleted: cell.deleted + run.deleted.length,
    authorKeys: [...new Set([...cell.authorKeys, ...run.authorKeys])].sort(),
  };
}

export function buildBins({
  runs,
  binStarts,
  binMs,
  versionSequenceAt,
}: {
  runs: EditRun[];
  binStarts: number[];
  binMs: number;
  versionSequenceAt: (time: number) => number | null;
}): TimelineBin[] {
  return binStarts.map((start) => ({
    start,
    versionSequence: versionSequenceAt(start + binMs - 1),
    byBand: runs
      .filter((run) => run.binStart === start)
      .reduce<Record<string, TimelineCell>>((cells, run) => ({ ...cells, [run.bandId]: mergeCell({ cell: cells[run.bandId], run }) }), {}),
  }));
}
