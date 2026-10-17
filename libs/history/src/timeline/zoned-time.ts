import { DAY_MS, HOUR_MS, SECOND_MS, WEEK_MS } from '@superdoc-collab/types';

const LOCALE = 'en-US';
const HOURS_PER_DAY = 24;
const FIRST_MONDAY_EPOCH_DAY = 4;
const FIRST_MONDAY_LOCAL_MS = FIRST_MONDAY_EPOCH_DAY * DAY_MS;
const LONGEST_SHIFT_MS = 2 * HOUR_MS;
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

function alignedLocal({ localTime, binMs }: { localTime: number; binMs: number }): number {
  const anchor = binMs % WEEK_MS === 0 ? FIRST_MONDAY_LOCAL_MS : 0;
  return Math.floor((localTime - anchor) / binMs) * binMs + anchor;
}

function firstInstantWithOffset({ offset, from, to, timeZone }: { offset: number; from: number; to: number; timeZone: string }): number {
  if (to - from <= 1) return to;
  const middle = Math.floor((from + to) / 2);
  if (offsetAt({ time: middle, timeZone }) === offset) return firstInstantWithOffset({ offset, from, to: middle, timeZone });
  return firstInstantWithOffset({ offset, from: middle, to, timeZone });
}

export function zonedBinStartOf({ time, binMs, timeZone }: { time: number; binMs: number; timeZone: string }): number {
  const offset = offsetAt({ time, timeZone });
  const flooredLocal = alignedLocal({ localTime: time + offset, binMs });
  const candidate = flooredLocal - offset;
  if (offsetAt({ time: candidate, timeZone }) === offset) return candidate;
  const transition = firstInstantWithOffset({ offset, from: candidate, to: time, timeZone });
  const offsetBefore = offsetAt({ time: transition - 1, timeZone });
  if (flooredLocal - offsetBefore >= transition) return transition;
  return zonedBinStartOf({ time: transition - 1, binMs, timeZone });
}

function steppedBack({ next, start, binMs, timeZone }: { next: number; start: number; binMs: number; timeZone: string }): number {
  const previous = zonedBinStartOf({ time: next - 1, binMs, timeZone });
  if (previous <= start) return next;
  return steppedBack({ next: previous, start, binMs, timeZone });
}

export function nextZonedBinStart({ start, binMs, timeZone }: { start: number; binMs: number; timeZone: string }): number {
  const probed = zonedBinStartOf({ time: start + binMs, binMs, timeZone });
  const next = probed > start ? probed : zonedBinStartOf({ time: start + binMs + LONGEST_SHIFT_MS, binMs, timeZone });
  return steppedBack({ next, start, binMs, timeZone });
}
