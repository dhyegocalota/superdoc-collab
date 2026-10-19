import { MINUTE_MS, NARROWEST_BIN_MS, SECOND_MS, WEEK_MS, type TimelineBin, type TimelineCell } from '@superdoc-collab/types';
import { MAX_REVISION_YEAR, MIN_REVISION_YEAR } from '../imported-revisions';
import { isAgentRun, type EditRun } from './runs';
import { nextZonedBinStart, zonedBinStartOf } from './zoned-time';

// NB ADR 0016: the bin cap keeps the streamgraph re-render inside its 16 ms budget; a span picks the finest ladder step that fits.
export const MAX_BINS = 120;
const EDGE_BINS = 1;
const COVERING_EXTRA_BINS = 2 * EDGE_BINS + 2;
const MAX_COVERING_BINS = MAX_BINS + COVERING_EXTRA_BINS;

export class NonAdvancingBinError extends Error {
  constructor({ start, next }: { start: number; next: number }) {
    super(`Bin after ${start} ends at ${next}, which is not after it.`);
  }
}

export class TooManyBinsError extends Error {
  constructor(limit: number) {
    super(`The span needs more than ${limit} bins.`);
  }
}
const SUB_MINUTE_BINS_MS = [NARROWEST_BIN_MS, 30 * SECOND_MS];
const BIN_LADDER_MINUTES = [1, 2, 5, 10, 15, 30, 60, 180, 360, 720, 1440];
export const BIN_LADDER_MS = [...SUB_MINUTE_BINS_MS, ...BIN_LADDER_MINUTES.map((minutes) => minutes * MINUTE_MS), WEEK_MS];

export function chooseBinMs(spanMs: number): number {
  const fitting = BIN_LADDER_MS.find((binMs) => Math.ceil(spanMs / binMs) + COVERING_EXTRA_BINS <= MAX_BINS);
  if (fitting) return fitting;
  return Math.ceil(spanMs / (MAX_BINS - COVERING_EXTRA_BINS) / WEEK_MS) * WEEK_MS;
}

const MAX_IMPORTED_SPAN_MS = Date.UTC(MAX_REVISION_YEAR + 1, 0, 1) - Date.UTC(MIN_REVISION_YEAR, 0, 1);
export const MAX_BIN_MS = chooseBinMs(MAX_IMPORTED_SPAN_MS);

function advancedStart({ start, binMs, timeZone }: { start: number; binMs: number; timeZone: string }): number {
  const next = nextZonedBinStart({ start, binMs, timeZone });
  if (next <= start) throw new NonAdvancingBinError({ start, next });
  return next;
}

export function binStartsCovering({
  firstTime,
  lastTime,
  binMs,
  timeZone,
}: {
  firstTime: number;
  lastTime: number;
  binMs: number;
  timeZone: string;
}): number[] {
  const firstStart = zonedBinStartOf({ time: firstTime, binMs, timeZone });
  const lastStart = zonedBinStartOf({ time: lastTime, binMs, timeZone });
  const lastEnd = nextZonedBinStart({ start: lastStart, binMs, timeZone });
  let start = zonedBinStartOf({ time: firstStart - 1, binMs, timeZone });
  const starts = [start];
  while (start < lastEnd) {
    if (starts.length >= MAX_COVERING_BINS) throw new TooManyBinsError(MAX_COVERING_BINS);
    start = advancedStart({ start, binMs, timeZone });
    starts.push(start);
  }
  return starts;
}

function mergeCell({ cell, run }: { cell: TimelineCell | undefined; run: EditRun }): TimelineCell {
  const agentShare = isAgentRun(run) ? { inserted: run.inserted.length, deleted: run.deleted.length } : { inserted: 0, deleted: 0 };
  if (!cell) {
    return {
      inserted: run.inserted.length,
      deleted: run.deleted.length,
      agentInserted: agentShare.inserted,
      agentDeleted: agentShare.deleted,
      authorKeys: run.authorKeys,
    };
  }
  return {
    inserted: cell.inserted + run.inserted.length,
    deleted: cell.deleted + run.deleted.length,
    agentInserted: cell.agentInserted + agentShare.inserted,
    agentDeleted: cell.agentDeleted + agentShare.deleted,
    authorKeys: [...new Set([...cell.authorKeys, ...run.authorKeys])].sort(),
  };
}

export function buildBins({
  runs,
  binStarts,
  binMs,
  timeZone,
  versionSequenceAt,
}: {
  runs: EditRun[];
  binStarts: number[];
  binMs: number;
  timeZone: string;
  versionSequenceAt: (time: number) => number | null;
}): TimelineBin[] {
  return binStarts.map((start) => {
    const end = nextZonedBinStart({ start, binMs, timeZone });
    return {
      start,
      end,
      versionSequence: versionSequenceAt(end - 1),
      byBand: runs
        .filter((run) => run.binStart === start)
        .reduce<Record<string, TimelineCell>>(
          (cells, run) => ({ ...cells, [run.bandId]: mergeCell({ cell: cells[run.bandId], run }) }),
          {},
        ),
    };
  });
}
