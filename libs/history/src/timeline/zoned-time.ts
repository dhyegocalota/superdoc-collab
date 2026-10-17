import { DAY_MS, SECOND_MS } from '@superdoc-collab/types';

const LOCALE = 'en-US';
const HOURS_PER_DAY = 24;
const FIRST_MONDAY_EPOCH_DAY = 4;
const FIRST_MONDAY_LOCAL_MS = FIRST_MONDAY_EPOCH_DAY * DAY_MS;
const NEXT_BIN_PROBE = 1.5;
const partsFormats = new Map<string, Intl.DateTimeFormat>();

function partsFormat(timeZone: string): Intl.DateTimeFormat {
  const cached = partsFormats.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  partsFormats.set(timeZone, created);
  return created;
}

function fieldOf({ fields, type }: { fields: Map<string, number>; type: Intl.DateTimeFormatPartTypes }): number {
  const value = fields.get(type);
  if (value === undefined) throw new Error(`Time zone parts have no ${type}.`);
  return value;
}

export function offsetAt({ time, timeZone }: { time: number; timeZone: string }): number {
  const wholeSecond = Math.floor(time / SECOND_MS) * SECOND_MS;
  const fields = new Map(
    partsFormat(timeZone)
      .formatToParts(wholeSecond)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  const localTime = Date.UTC(
    fieldOf({ fields, type: 'year' }),
    fieldOf({ fields, type: 'month' }) - 1,
    fieldOf({ fields, type: 'day' }),
    fieldOf({ fields, type: 'hour' }) % HOURS_PER_DAY,
    fieldOf({ fields, type: 'minute' }),
    fieldOf({ fields, type: 'second' }),
  );
  return localTime - wholeSecond;
}

function instantOfLocal({ localTime, assumedOffset, timeZone }: { localTime: number; assumedOffset: number; timeZone: string }): number {
  const guess = localTime - assumedOffset;
  const actualOffset = offsetAt({ time: guess, timeZone });
  if (actualOffset === assumedOffset) return guess;
  return localTime - actualOffset;
}

export function zonedBinStartOf({ time, binMs, timeZone }: { time: number; binMs: number; timeZone: string }): number {
  const offset = offsetAt({ time, timeZone });
  const localTime = time + offset;
  const flooredLocal = FIRST_MONDAY_LOCAL_MS + Math.floor((localTime - FIRST_MONDAY_LOCAL_MS) / binMs) * binMs;
  return instantOfLocal({ localTime: flooredLocal, assumedOffset: offset, timeZone });
}

export function nextZonedBinStart({ start, binMs, timeZone }: { start: number; binMs: number; timeZone: string }): number {
  return zonedBinStartOf({ time: start + NEXT_BIN_PROBE * binMs, binMs, timeZone });
}
