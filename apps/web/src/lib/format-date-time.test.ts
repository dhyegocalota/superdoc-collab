import { MINUTE_MS, SECOND_MS } from '@superdoc-history/types';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { formatBinMoment, formatBinRange, formatTimestamp, formatVersionMoment } from './format-date-time';

const NOW = new Date(2026, 9, 17, 7, 50, 0).getTime();
const BIN_START = new Date(2026, 9, 17, 7, 45, 10).getTime();
const LAST_YEAR_BIN_START = new Date(2025, 9, 17, 7, 45, 0).getTime();
const SECONDS_BIN_MS = 10 * SECOND_MS;
const CLOCK_WITH_SECONDS = /\d{1,2}:\d{2}:\d{2}/g;
const MONTH_LABEL = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(BIN_START);
const CURRENT_YEAR = '2026';
const LAST_YEAR = '2025';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

function occurrences({ text, part }: { text: string; part: string }): number {
  return text.split(part).length - 1;
}

test('a timestamp carries the date and the time', () => {
  expect(formatTimestamp(BIN_START)).toBe(
    new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(BIN_START),
  );
});

test('a bin under a minute shows both ends with seconds and the date once', () => {
  const range = formatBinRange({ start: BIN_START, binMs: SECONDS_BIN_MS });
  expect(range.match(CLOCK_WITH_SECONDS)).toHaveLength(2);
  expect(occurrences({ text: range, part: MONTH_LABEL })).toBe(1);
  expect(range).not.toContain(CURRENT_YEAR);
});

test('a minute bin shows minutes and the date once', () => {
  const range = formatBinRange({ start: BIN_START, binMs: MINUTE_MS });
  expect(range.match(CLOCK_WITH_SECONDS)).toBeNull();
  expect(occurrences({ text: range, part: MONTH_LABEL })).toBe(1);
});

test('a bin from an earlier year carries its year', () => {
  expect(formatBinRange({ start: LAST_YEAR_BIN_START, binMs: MINUTE_MS })).toContain(LAST_YEAR);
});

test('a bin moment follows the precision of its bins', () => {
  expect(formatBinMoment({ time: BIN_START, binMs: SECONDS_BIN_MS }).match(CLOCK_WITH_SECONDS)).toHaveLength(1);
  expect(formatBinMoment({ time: BIN_START, binMs: MINUTE_MS }).match(CLOCK_WITH_SECONDS)).toBeNull();
});

test('two versions seconds apart today read differently and carry no date', () => {
  expect(formatVersionMoment(BIN_START)).not.toBe(formatVersionMoment(BIN_START + SECONDS_BIN_MS));
  expect(formatVersionMoment(BIN_START)).not.toContain(MONTH_LABEL);
});
