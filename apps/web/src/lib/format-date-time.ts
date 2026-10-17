const TIMESTAMP_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const TIME_OF_DAY_FORMAT = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
const RANGE_SEPARATOR = ' – ';

export function formatTimestamp(time: number): string {
  return TIMESTAMP_FORMAT.format(time);
}

export function formatTimeOfDay(time: number): string {
  return TIME_OF_DAY_FORMAT.format(time);
}

export function formatBinMoment({ time }: { time: number; binMs: number }): string {
  return formatTimestamp(time);
}

export function formatBinRange({ start, binMs }: { start: number; binMs: number }): string {
  return `${formatTimestamp(start)}${RANGE_SEPARATOR}${formatTimestamp(start + binMs)}`;
}

export function formatVersionMoment(time: number): string {
  return formatTimestamp(time);
}
