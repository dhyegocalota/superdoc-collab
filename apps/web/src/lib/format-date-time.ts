import { MINUTE_MS } from '@superdoc-collab/types';

const LOCALE = 'en-US';
const TIMESTAMP_PARTS: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };
const VERSION_TIME_PARTS: Intl.DateTimeFormatOptions = { timeStyle: 'medium' };
const DATED_VERSION_TIME_PARTS: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'medium' };
const MINUTE_PARTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
const SECOND_PARTS: Intl.DateTimeFormatOptions = { ...MINUTE_PARTS, second: '2-digit' };
const YEAR_PART: Intl.DateTimeFormatOptions = { year: 'numeric' };
const DAY_PARTS: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric' };

export enum TimePrecision {
  Minute = 'minute',
  Second = 'second',
}

const BIN_PARTS: Record<TimePrecision, { withoutYear: Intl.DateTimeFormatOptions; withYear: Intl.DateTimeFormatOptions }> = {
  [TimePrecision.Minute]: { withoutYear: MINUTE_PARTS, withYear: { ...MINUTE_PARTS, ...YEAR_PART } },
  [TimePrecision.Second]: { withoutYear: SECOND_PARTS, withYear: { ...SECOND_PARTS, ...YEAR_PART } },
};

const formats = new Map<string, Intl.DateTimeFormat>();

function formatFor({ timeZone, parts }: { timeZone: string; parts: Intl.DateTimeFormatOptions }): Intl.DateTimeFormat {
  const key = JSON.stringify([timeZone, parts]);
  const cached = formats.get(key);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat(LOCALE, { ...parts, timeZone });
  formats.set(key, created);
  return created;
}

export function precisionOf(binMs: number): TimePrecision {
  if (binMs < MINUTE_MS) return TimePrecision.Second;
  return TimePrecision.Minute;
}

function isThisYear({ time, timeZone }: { time: number; timeZone: string }): boolean {
  const format = formatFor({ timeZone, parts: YEAR_PART });
  return format.format(time) === format.format(Date.now());
}

function isToday({ time, timeZone }: { time: number; timeZone: string }): boolean {
  const format = formatFor({ timeZone, parts: DAY_PARTS });
  return format.format(time) === format.format(Date.now());
}

function binFormat({ time, binMs, timeZone }: { time: number; binMs: number; timeZone: string }): Intl.DateTimeFormat {
  const parts = BIN_PARTS[precisionOf(binMs)];
  if (isThisYear({ time, timeZone })) return formatFor({ timeZone, parts: parts.withoutYear });
  return formatFor({ timeZone, parts: parts.withYear });
}

export function formatTimestamp({ time, timeZone }: { time: number; timeZone: string }): string {
  return formatFor({ timeZone, parts: TIMESTAMP_PARTS }).format(time);
}

export function formatBinMoment({ time, binMs, timeZone }: { time: number; binMs: number; timeZone: string }): string {
  return binFormat({ time, binMs, timeZone }).format(time);
}

export function formatBinRange({ start, end, binMs, timeZone }: { start: number; end: number; binMs: number; timeZone: string }): string {
  return binFormat({ time: start, binMs, timeZone }).formatRange(start, end);
}

export function formatVersionMoment({ time, timeZone }: { time: number; timeZone: string }): string {
  if (isToday({ time, timeZone })) return formatFor({ timeZone, parts: VERSION_TIME_PARTS }).format(time);
  return formatFor({ timeZone, parts: DATED_VERSION_TIME_PARTS }).format(time);
}
