import { expect, test } from 'vitest';
import { formatBinRange, formatTimeOfDay, formatTimestamp } from './format-date-time';

const MOMENT = Date.UTC(2026, 9, 17, 14, 2);
const LATER = MOMENT + 60_000;

test('a timestamp carries the date and the time, a time of day only the time', () => {
  expect(formatTimestamp(MOMENT)).toBe(new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(MOMENT));
  expect(formatTimeOfDay(MOMENT)).toBe(new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(MOMENT));
});

test('a bin range joins both ends with an en dash', () => {
  expect(formatBinRange({ start: MOMENT, end: LATER })).toBe(`${formatTimestamp(MOMENT)} – ${formatTimestamp(LATER)}`);
});
