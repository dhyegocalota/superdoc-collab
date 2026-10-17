import { MINUTE_MS } from '@superdoc-history/types';

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const VERSION_TIME_FORMAT = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' });
const DATED_VERSION_TIME_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
const MINUTE_PARTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
const SECOND_PARTS: Intl.DateTimeFormatOptions = { ...MINUTE_PARTS, second: '2-digit' };
const YEAR_PART: Intl.DateTimeFormatOptions = { year: 'numeric' };

export enum TimePrecision {
  Minute = 'minute',
  Second = 'second',
}

const BIN_FORMATS: Record<TimePrecision, { withoutYear: Intl.DateTimeFormat; withYear: Intl.DateTimeFormat }> = {
  [TimePrecision.Minute]: {
    withoutYear: new Intl.DateTimeFormat(undefined, MINUTE_PARTS),
    withYear: new Intl.DateTimeFormat(undefined, { ...MINUTE_PARTS, ...YEAR_PART }),
  },
  [TimePrecision.Second]: {
    withoutYear: new Intl.DateTimeFormat(undefined, SECOND_PARTS),
    withYear: new Intl.DateTimeFormat(undefined, { ...SECOND_PARTS, ...YEAR_PART }),
  },
};

export function precisionOf(binMs: number): TimePrecision {
  if (binMs < MINUTE_MS) return TimePrecision.Second;
  return TimePrecision.Minute;
}

function isThisYear(time: number): boolean {
  return new Date(time).getFullYear() === new Date().getFullYear();
}

function isToday(time: number): boolean {
  return new Date(time).toDateString() === new Date().toDateString();
}

function binFormat({ time, binMs }: { time: number; binMs: number }): Intl.DateTimeFormat {
  const formats = BIN_FORMATS[precisionOf(binMs)];
  if (isThisYear(time)) return formats.withoutYear;
  return formats.withYear;
}

export function formatTimestamp(time: number): string {
  return TIMESTAMP_FORMAT.format(time);
}

export function formatBinMoment({ time, binMs }: { time: number; binMs: number }): string {
  return binFormat({ time, binMs }).format(time);
}

export function formatBinRange({ start, binMs }: { start: number; binMs: number }): string {
  return binFormat({ time: start, binMs }).formatRange(start, start + binMs);
}

export function formatVersionMoment(time: number): string {
  if (isToday(time)) return VERSION_TIME_FORMAT.format(time);
  return DATED_VERSION_TIME_FORMAT.format(time);
}
