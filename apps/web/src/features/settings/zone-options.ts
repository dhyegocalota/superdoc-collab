import { UTC_TIME_ZONE } from '@superdoc-collab/types';
import { unsupportedTimeZoneLabel } from './settings-copy';

export type TimeZoneOption = { value: string; label: string };

const OFFSET_PART_TYPE = 'timeZoneName';
const OFFSET_PREFIX = 'GMT';
const ZERO_OFFSET = '+00:00';

function offsetLabel({ timeZone, now }: { timeZone: string; now: number }): string {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' });
  const part = formatter.formatToParts(now).find((candidate) => candidate.type === OFFSET_PART_TYPE);
  if (!part) throw new Error(`No offset for ${timeZone}`);
  const offset = part.value.slice(OFFSET_PREFIX.length);
  return `${timeZone} (${UTC_TIME_ZONE}${offset === '' ? ZERO_OFFSET : offset})`;
}

export function timeZoneOptions({ now, current }: { now: number; current: string }): TimeZoneOption[] {
  const supported = new Set([...Intl.supportedValuesOf('timeZone'), UTC_TIME_ZONE]);
  const isUnsupported = !supported.has(current);
  const values = [...supported, ...(isUnsupported ? [current] : [])].sort();
  return values.map((value) => ({
    value,
    label: value === current && isUnsupported ? unsupportedTimeZoneLabel(value) : offsetLabel({ timeZone: value, now }),
  }));
}
