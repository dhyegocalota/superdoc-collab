import { HOUR_MS, MINUTE_MS, SECOND_MS, UTC_TIME_ZONE } from '@superdoc-collab/types';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { formatBinMoment, formatBinRange, formatTimestamp, formatVersionMoment } from './format-date-time';

const SAO_PAULO = 'America/Sao_Paulo';
const LISBON = 'Europe/Lisbon';
const KIRITIMATI = 'Pacific/Kiritimati';
const NOW = Date.UTC(2026, 9, 17, 2, 0, 0);
const MIDNIGHT_UTC = Date.UTC(2026, 9, 17, 0, 0);
const BIN_START = Date.UTC(2026, 9, 17, 10, 45, 10);
const LAST_YEAR_BIN_START = Date.UTC(2025, 9, 17, 10, 45, 0);
const SECONDS_BIN_MS = 10 * SECOND_MS;
const CLOCK_WITH_SECONDS = /\d{1,2}:\d{2}:\d{2}/g;
const CURRENT_YEAR = '2026';
const LAST_YEAR = '2025';
const YEAR_END_NOW = Date.UTC(2026, 11, 31, 23, 30);
const YEAR_END_TIME = Date.UTC(2026, 11, 31, 5, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

function plain(text: string): string {
  return text.replace(/\s/g, ' ');
}

function occurrences({ text, part }: { text: string; part: string }): number {
  return text.split(part).length - 1;
}

test('a timestamp reads in the zone it is given', () => {
  expect(plain(formatTimestamp({ time: MIDNIGHT_UTC, timeZone: SAO_PAULO }))).toBe('Oct 16, 2026, 9:00 PM');
  expect(plain(formatTimestamp({ time: MIDNIGHT_UTC, timeZone: LISBON }))).toBe('Oct 17, 2026, 1:00 AM');
});

test('a bin under a minute shows both ends with seconds and the date once', () => {
  const range = plain(formatBinRange({ start: BIN_START, end: BIN_START + SECONDS_BIN_MS, binMs: SECONDS_BIN_MS, timeZone: LISBON }));
  expect(range.match(CLOCK_WITH_SECONDS)).toHaveLength(2);
  expect(occurrences({ text: range, part: 'Oct' })).toBe(1);
  expect(range).not.toContain(CURRENT_YEAR);
});

test('a minute bin shows minutes and the date once', () => {
  const range = formatBinRange({ start: BIN_START, end: BIN_START + MINUTE_MS, binMs: MINUTE_MS, timeZone: LISBON });
  expect(range.match(CLOCK_WITH_SECONDS)).toBeNull();
  expect(occurrences({ text: range, part: 'Oct' })).toBe(1);
});

test('a bin range ends where the bin ends, not one bin size after its start', () => {
  const dayStart = Date.UTC(2026, 9, 24, 23, 0);
  const range = plain(formatBinRange({ start: dayStart, end: dayStart + 25 * HOUR_MS, binMs: 24 * HOUR_MS, timeZone: LISBON }));
  expect(range).toContain('Oct 25');
  expect(range).toContain('Oct 26');
});

test('a bin from an earlier year carries its year', () => {
  expect(
    formatBinRange({ start: LAST_YEAR_BIN_START, end: LAST_YEAR_BIN_START + MINUTE_MS, binMs: MINUTE_MS, timeZone: LISBON }),
  ).toContain(LAST_YEAR);
});

test('this year is decided in the zone', () => {
  vi.setSystemTime(YEAR_END_NOW);
  expect(formatBinMoment({ time: YEAR_END_TIME, binMs: MINUTE_MS, timeZone: UTC_TIME_ZONE })).not.toContain(CURRENT_YEAR);
  expect(formatBinMoment({ time: YEAR_END_TIME, binMs: MINUTE_MS, timeZone: KIRITIMATI })).toContain(CURRENT_YEAR);
});

test('a bin moment follows the precision of its bins', () => {
  expect(formatBinMoment({ time: BIN_START, binMs: SECONDS_BIN_MS, timeZone: LISBON }).match(CLOCK_WITH_SECONDS)).toHaveLength(1);
  expect(formatBinMoment({ time: BIN_START, binMs: MINUTE_MS, timeZone: LISBON }).match(CLOCK_WITH_SECONDS)).toBeNull();
});

test('two versions seconds apart today read differently and carry no date', () => {
  const later = BIN_START + SECONDS_BIN_MS;
  expect(formatVersionMoment({ time: BIN_START, timeZone: LISBON })).not.toBe(formatVersionMoment({ time: later, timeZone: LISBON }));
  expect(formatVersionMoment({ time: BIN_START, timeZone: LISBON })).not.toContain('Oct');
});

test('today is decided in the zone', () => {
  const nearMidnight = Date.UTC(2026, 9, 17, 3, 0);
  expect(formatVersionMoment({ time: nearMidnight, timeZone: LISBON })).not.toContain('Oct');
  expect(formatVersionMoment({ time: nearMidnight, timeZone: SAO_PAULO })).toContain('Oct');
});
