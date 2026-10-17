import { isSupportedTimeZone, UTC_TIME_ZONE } from '@superdoc-collab/types';
import { formatTimeZoneOffset } from '@/lib/format-date-time';
import { unsupportedTimeZoneLabel } from './settings-copy';

export type TimeZoneOption = { value: string; label: string };

export function canonicalTimeZone(timeZone: string): string {
  if (!isSupportedTimeZone(timeZone)) return timeZone;
  return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone;
}

export function timeZoneOptions({ now, extra }: { now: number; extra: string[] }): TimeZoneOption[] {
  const values = [...new Set([...Intl.supportedValuesOf('timeZone'), UTC_TIME_ZONE, ...extra])].sort();
  return values.map((value) => ({
    value,
    label: isSupportedTimeZone(value)
      ? `${value} (${formatTimeZoneOffset({ time: now, timeZone: value })})`
      : unsupportedTimeZoneLabel(value),
  }));
}
