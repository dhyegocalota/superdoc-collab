import type { EventAuthor } from '@superdoc-collab/types';
import { nextZonedBinStart, zonedBinStartOf } from './zoned-time';

const IMPORTED_AUTHOR_PREFIX = 'imported:';
const RUN_KEY_SEPARATOR = '|';

export type TimelineEvent = {
  sequence: number;
  serverTime: number;
  blockId: string;
  bandId: string;
  authorKeys: string[];
  inserted: string;
  deleted: string;
};
export type EditRun = {
  binStart: number;
  blockId: string;
  bandId: string;
  authorKeys: string[];
  inserted: string;
  deleted: string;
  firstServerTime: number;
  lastServerTime: number;
  lastSequence: number;
};

export function authorKey(author: EventAuthor): string {
  if (author.id === null) return `${IMPORTED_AUTHOR_PREFIX}${author.name}`;
  return author.id;
}

function occupiedBinStarts({ events, binMs, timeZone }: { events: TimelineEvent[]; binMs: number; timeZone: string }): number[] {
  const starts: number[] = [];
  let currentEnd = -Infinity;
  events
    .map((event) => event.serverTime)
    .sort((left, right) => left - right)
    .forEach((time) => {
      if (time < currentEnd) return;
      const start = zonedBinStartOf({ time, binMs, timeZone });
      starts.push(start);
      currentEnd = nextZonedBinStart({ start, binMs, timeZone });
    });
  return starts;
}

function binStartContaining({ binStarts, time }: { binStarts: number[]; time: number }): number {
  let low = 0;
  let high = binStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (binStarts[middle]! <= time) low = middle;
    else high = middle - 1;
  }
  return binStarts[low]!;
}

export function groupIntoRuns({ events, binMs, timeZone }: { events: TimelineEvent[]; binMs: number; timeZone: string }): EditRun[] {
  const runs = new Map<string, EditRun>();
  const binStarts = occupiedBinStarts({ events, binMs, timeZone });
  [...events]
    .sort((left, right) => left.sequence - right.sequence || left.serverTime - right.serverTime)
    .forEach((event) => {
      const binStart = binStartContaining({ binStarts, time: event.serverTime });
      const key = [binStart, event.blockId, event.authorKeys.join(',')].join(RUN_KEY_SEPARATOR);
      const run = runs.get(key);
      if (!run) {
        runs.set(key, {
          binStart,
          blockId: event.blockId,
          bandId: event.bandId,
          authorKeys: event.authorKeys,
          inserted: event.inserted,
          deleted: event.deleted,
          firstServerTime: event.serverTime,
          lastServerTime: event.serverTime,
          lastSequence: event.sequence,
        });
        return;
      }
      runs.set(key, {
        ...run,
        inserted: run.inserted + event.inserted,
        deleted: run.deleted + event.deleted,
        lastServerTime: event.serverTime,
        lastSequence: event.sequence,
      });
    });
  return [...runs.values()];
}

export function runVolume(run: Pick<EditRun, 'inserted' | 'deleted'>): number {
  return run.inserted.length + run.deleted.length;
}

export function runMatchesTerm({ run, term }: { run: EditRun; term: string }): boolean {
  const searchText = term.toLocaleLowerCase();
  const backspacedDeletion = [...run.deleted].reverse().join('');
  return [run.inserted, run.deleted, backspacedDeletion].some((text) => text.toLocaleLowerCase().includes(searchText));
}

export function filterRuns({
  runs,
  term,
  authorKeys,
}: {
  runs: EditRun[];
  term: string | null;
  authorKeys: Set<string> | null;
}): EditRun[] {
  return runs.filter((run) => {
    const matchesTerm = term === null || runMatchesTerm({ run, term });
    const matchesAuthor = authorKeys === null || run.authorKeys.some((key) => authorKeys.has(key));
    return matchesTerm && matchesAuthor;
  });
}

export function narrowRuns({ runs, bandId, binStart }: { runs: EditRun[]; bandId: string | null; binStart: number | null }): EditRun[] {
  return runs.filter((run) => {
    const matchesBand = bandId === null || run.bandId === bandId;
    const matchesBin = binStart === null || run.binStart === binStart;
    return matchesBand && matchesBin;
  });
}
