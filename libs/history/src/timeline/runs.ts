import type { EventAuthor } from '@superdoc-history/types';
import { binStartOf } from './bins';

const IMPORTED_AUTHOR_PREFIX = 'imported:';
const RUN_KEY_SEPARATOR = '|';

export type TimelineEvent = { sequence: number; serverTime: number; blockId: string; bandId: string; authorKeys: string[]; inserted: string; deleted: string };
export type EditRun = { binStart: number; blockId: string; bandId: string; authorKeys: string[]; inserted: string; deleted: string; firstServerTime: number; lastServerTime: number; lastSequence: number };

export function authorKey(author: EventAuthor): string {
  if (author.id === null) return `${IMPORTED_AUTHOR_PREFIX}${author.name}`;
  return author.id;
}

export function groupIntoRuns({ events, binMs }: { events: TimelineEvent[]; binMs: number }): EditRun[] {
  const runs = new Map<string, EditRun>();
  [...events].sort((left, right) => left.sequence - right.sequence || left.serverTime - right.serverTime).forEach((event) => {
    const binStart = binStartOf({ time: event.serverTime, binMs });
    const key = [binStart, event.blockId, event.authorKeys.join(',')].join(RUN_KEY_SEPARATOR);
    const run = runs.get(key);
    if (!run) {
      runs.set(key, { binStart, blockId: event.blockId, bandId: event.bandId, authorKeys: event.authorKeys, inserted: event.inserted, deleted: event.deleted, firstServerTime: event.serverTime, lastServerTime: event.serverTime, lastSequence: event.sequence });
      return;
    }
    runs.set(key, { ...run, inserted: run.inserted + event.inserted, deleted: run.deleted + event.deleted, lastServerTime: event.serverTime, lastSequence: event.sequence });
  });
  return [...runs.values()];
}

export function runMatchesTerm({ run, term }: { run: EditRun; term: string }): boolean {
  const needle = term.toLocaleLowerCase();
  const backspacedDeletion = [...run.deleted].reverse().join('');
  return [run.inserted, run.deleted, backspacedDeletion].some((text) => text.toLocaleLowerCase().includes(needle));
}

export function filterRuns({ runs, term, authorKeys }: { runs: EditRun[]; term: string | null; authorKeys: Set<string> | null }): EditRun[] {
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
