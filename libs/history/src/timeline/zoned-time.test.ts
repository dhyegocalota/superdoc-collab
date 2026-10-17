import { DAY_MS, HOUR_MS, MINUTE_MS, SECOND_MS, WEEK_MS } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { nextZonedBinStart, offsetAt, zonedBinStartOf } from './zoned-time';

const SAO_PAULO = 'America/Sao_Paulo';
const LISBON = 'Europe/Lisbon';
const KOLKATA = 'Asia/Kolkata';
const KATHMANDU = 'Asia/Kathmandu';
const KIRITIMATI = 'Pacific/Kiritimati';
const UTC = 'UTC';
const TEN_MINUTES_MS = 10 * MINUTE_MS;
const SIX_HOURS_MS = 6 * HOUR_MS;
const ALL_ZONES = [SAO_PAULO, LISBON, KOLKATA, KATHMANDU, KIRITIMATI, UTC];

test.each([
  [SAO_PAULO, Date.UTC(2026, 9, 17, 12, 0), -3 * HOUR_MS],
  [LISBON, Date.UTC(2026, 0, 15, 12, 0), 0],
  [LISBON, Date.UTC(2026, 6, 15, 12, 0), HOUR_MS],
  [KATHMANDU, Date.UTC(2026, 9, 17, 12, 0), 5 * HOUR_MS + 45 * MINUTE_MS],
  [KIRITIMATI, Date.UTC(2026, 9, 17, 12, 0), 14 * HOUR_MS],
  [UTC, Date.UTC(2026, 9, 17, 12, 0), 0],
])('offsetAt in %s at %i is %i ms', (timeZone, time, expected) => {
  expect(offsetAt({ time, timeZone })).toBe(expected);
});

test('offsetAt ignores the milliseconds inside the second', () => {
  expect(offsetAt({ time: Date.UTC(2026, 9, 17, 12, 0, 0, 999), timeZone: SAO_PAULO })).toBe(-3 * HOUR_MS);
});

test('offsetAt reads local midnight as hour zero, never 24', () => {
  expect(offsetAt({ time: Date.UTC(2026, 9, 17, 3, 0), timeZone: SAO_PAULO })).toBe(-3 * HOUR_MS);
  expect(offsetAt({ time: Date.UTC(2026, 9, 17, 0, 0), timeZone: UTC })).toBe(0);
});

test('a day bin in Sao Paulo starts at local midnight', () => {
  expect(zonedBinStartOf({ time: Date.UTC(2026, 9, 17, 2, 0), binMs: DAY_MS, timeZone: SAO_PAULO })).toBe(Date.UTC(2026, 9, 16, 3, 0));
});

test('a day bin on the Lisbon spring change lasts 23 hours', () => {
  const start = zonedBinStartOf({ time: Date.UTC(2026, 2, 29, 12, 0), binMs: DAY_MS, timeZone: LISBON });
  expect(start).toBe(Date.UTC(2026, 2, 29, 0, 0));
  expect(nextZonedBinStart({ start, binMs: DAY_MS, timeZone: LISBON })).toBe(Date.UTC(2026, 2, 29, 23, 0));
});

test('a day bin on the Lisbon autumn change lasts 25 hours', () => {
  const start = zonedBinStartOf({ time: Date.UTC(2026, 9, 25, 12, 0), binMs: DAY_MS, timeZone: LISBON });
  expect(start).toBe(Date.UTC(2026, 9, 24, 23, 0));
  expect(nextZonedBinStart({ start, binMs: DAY_MS, timeZone: LISBON })).toBe(Date.UTC(2026, 9, 26, 0, 0));
});

test.each([
  [KOLKATA, HOUR_MS, Date.UTC(2026, 9, 17, 10, 47), Date.UTC(2026, 9, 17, 10, 30)],
  [KATHMANDU, HOUR_MS, Date.UTC(2026, 9, 17, 10, 47), Date.UTC(2026, 9, 17, 10, 15)],
  [KOLKATA, TEN_MINUTES_MS, Date.UTC(2026, 9, 17, 10, 47), Date.UTC(2026, 9, 17, 10, 40)],
  [KATHMANDU, TEN_MINUTES_MS, Date.UTC(2026, 9, 17, 10, 47), Date.UTC(2026, 9, 17, 10, 45)],
  [KOLKATA, DAY_MS, Date.UTC(2026, 9, 17, 10, 47), Date.UTC(2026, 9, 16, 18, 30)],
  [KATHMANDU, DAY_MS, Date.UTC(2026, 9, 17, 10, 47), Date.UTC(2026, 9, 16, 18, 15)],
])('in %s a bin of %i ms at %i starts on a local boundary', (timeZone, binMs, time, expected) => {
  expect(zonedBinStartOf({ time, binMs, timeZone })).toBe(expected);
});

test.each([
  [Date.UTC(2026, 9, 17, 2, 59), Date.UTC(2026, 9, 16, 21, 0)],
  [Date.UTC(2026, 9, 17, 3, 0), Date.UTC(2026, 9, 17, 3, 0)],
  [Date.UTC(2026, 9, 17, 9, 0), Date.UTC(2026, 9, 17, 9, 0)],
  [Date.UTC(2026, 9, 17, 14, 59), Date.UTC(2026, 9, 17, 9, 0)],
  [Date.UTC(2026, 9, 17, 15, 0), Date.UTC(2026, 9, 17, 15, 0)],
  [Date.UTC(2026, 9, 17, 20, 59), Date.UTC(2026, 9, 17, 15, 0)],
])('a 6 h bin in Sao Paulo at %i starts at %i, a local 00, 06, 12 or 18', (time, expected) => {
  expect(zonedBinStartOf({ time, binMs: SIX_HOURS_MS, timeZone: SAO_PAULO })).toBe(expected);
});

test.each([
  [SAO_PAULO, Date.UTC(2026, 9, 17, 12, 0), Date.UTC(2026, 9, 12, 3, 0)],
  [SAO_PAULO, Date.UTC(2026, 9, 12, 2, 59), Date.UTC(2026, 9, 5, 3, 0)],
  [LISBON, Date.UTC(2026, 2, 29, 12, 0), Date.UTC(2026, 2, 23, 0, 0)],
  [LISBON, Date.UTC(2026, 3, 1, 12, 0), Date.UTC(2026, 2, 29, 23, 0)],
  [LISBON, Date.UTC(2026, 9, 25, 12, 0), Date.UTC(2026, 9, 18, 23, 0)],
  [LISBON, Date.UTC(2026, 9, 27, 12, 0), Date.UTC(2026, 9, 26, 0, 0)],
  [KIRITIMATI, Date.UTC(2026, 9, 11, 9, 59), Date.UTC(2026, 9, 4, 10, 0)],
  [KIRITIMATI, Date.UTC(2026, 9, 11, 10, 0), Date.UTC(2026, 9, 11, 10, 0)],
  [KIRITIMATI, Date.UTC(2026, 9, 12, 12, 0), Date.UTC(2026, 9, 11, 10, 0)],
  [UTC, Date.UTC(2026, 9, 17, 12, 0), Date.UTC(2026, 9, 12, 0, 0)],
])('in %s a week bin at %i starts on local Monday midnight', (timeZone, time, expected) => {
  expect(zonedBinStartOf({ time, binMs: WEEK_MS, timeZone })).toBe(expected);
});

test.each([10 * SECOND_MS, 30 * SECOND_MS])('a %i ms bin equals the epoch floor in every zone', (binMs) => {
  const time = Date.UTC(2026, 9, 17, 10, 47, 53, 421);
  ALL_ZONES.forEach((timeZone) => {
    expect(zonedBinStartOf({ time, binMs, timeZone })).toBe(Math.floor(time / binMs) * binMs);
  });
});

const CHAINED_BIN_SIZES_MS = [MINUTE_MS, TEN_MINUTES_MS, HOUR_MS, SIX_HOURS_MS, DAY_MS, WEEK_MS, 3 * WEEK_MS];
const CHAIN_FROM = Date.UTC(2026, 2, 20, 0, 0);
const CHAIN_BINS = 40;
const CHAIN_CASES = ALL_ZONES.flatMap((timeZone) => CHAINED_BIN_SIZES_MS.map((binMs) => [timeZone, binMs] as const));

test.each(CHAIN_CASES)('in %s a chain of %i ms bins is contiguous, idempotent and within an hour of its size', (timeZone, binMs) => {
  const first = zonedBinStartOf({ time: CHAIN_FROM, binMs, timeZone });
  const { bins } = Array.from({ length: CHAIN_BINS }).reduce<{ last: number; bins: { start: number; end: number }[] }>(
    (chain) => {
      const end = nextZonedBinStart({ start: chain.last, binMs, timeZone });
      return { last: end, bins: [...chain.bins, { start: chain.last, end }] };
    },
    { last: first, bins: [] },
  );
  bins.forEach(({ start, end }) => {
    expect(zonedBinStartOf({ time: start, binMs, timeZone })).toBe(start);
    expect(Math.abs(end - start - binMs)).toBeLessThanOrEqual(HOUR_MS);
    expect(zonedBinStartOf({ time: end - 1, binMs, timeZone })).toBe(start);
  });
});

const SCAN_STEP_MS = 15 * MINUTE_MS;
const SCAN_STEPS = (14 * DAY_MS) / SCAN_STEP_MS;
const SCAN_TIMES = Array.from({ length: SCAN_STEPS }, (_, index) => Date.UTC(2026, 9, 20, 0, 0) + index * SCAN_STEP_MS);

test.each(ALL_ZONES)('in %s every instant around the autumn change lands inside the day and week bin that contains it', (timeZone) => {
  [DAY_MS, WEEK_MS].forEach((binMs) => {
    SCAN_TIMES.forEach((time) => {
      const start = zonedBinStartOf({ time, binMs, timeZone });
      expect(start).toBeLessThanOrEqual(time);
      expect(time).toBeLessThan(nextZonedBinStart({ start, binMs, timeZone }));
    });
  });
});

test.each([50, 999])('offsetAt in UTC at the year %i is zero, never shifted by a two digit year mapping', (year) => {
  const time = new Date(0).setUTCFullYear(year, 5, 1);
  expect(offsetAt({ time, timeZone: UTC })).toBe(0);
});
