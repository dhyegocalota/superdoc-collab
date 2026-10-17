import { DAY_MS, HOUR_MS, MINUTE_MS, SECOND_MS, WEEK_MS } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { nextZonedBinStart, offsetAt, zonedBinStartOf } from './zoned-time';

const CHATHAM = 'Pacific/Chatham';
const LORD_HOWE = 'Australia/Lord_Howe';
const JERUSALEM = 'Asia/Jerusalem';
const CAIRO = 'Africa/Cairo';
const SANTIAGO = 'America/Santiago';
const TROLL = 'Antarctica/Troll';
const LISBON = 'Europe/Lisbon';
const SAO_PAULO = 'America/Sao_Paulo';
const HARD_ZONES = [CHATHAM, LORD_HOWE, JERUSALEM, CAIRO, SANTIAGO, TROLL, LISBON, SAO_PAULO];
const HARD_BIN_SIZES_MS = [
  2 * MINUTE_MS,
  10 * MINUTE_MS,
  30 * MINUTE_MS,
  HOUR_MS,
  3 * HOUR_MS,
  12 * HOUR_MS,
  DAY_MS,
  WEEK_MS,
  2 * WEEK_MS,
  3 * WEEK_MS,
  5 * WEEK_MS,
];
const YEAR_START = Date.UTC(2026, 0, 1);
const YEAR_END = Date.UTC(2027, 0, 1);
const LONG_END = Date.UTC(2029, 0, 1);
const TRANSITION_SCAN_STEP_MS = 15 * MINUTE_MS;
const TRANSITION_WINDOW_MS = DAY_MS;
const COARSE_SAMPLE_STEP_MS = 7 * MINUTE_MS + 13 * SECOND_MS;
const FINE_SAMPLE_STEP_MS = 20 * SECOND_MS + 11;
const MONDAY_ANCHOR_MS = 4 * DAY_MS;

function transitionsOf(timeZone: string): number[] {
  const scanCount = (YEAR_END - YEAR_START) / TRANSITION_SCAN_STEP_MS;
  const scanTimes = Array.from({ length: scanCount }, (_, index) => YEAR_START + index * TRANSITION_SCAN_STEP_MS);
  return scanTimes.filter((time) => offsetAt({ time, timeZone }) !== offsetAt({ time: time - TRANSITION_SCAN_STEP_MS, timeZone }));
}

function walkStarts({ from, to, binMs, timeZone }: { from: number; to: number; binMs: number; timeZone: string }): number[] {
  const starts = [zonedBinStartOf({ time: from, binMs, timeZone })];
  while (starts[starts.length - 1] < to) {
    const previous = starts[starts.length - 1];
    const next = nextZonedBinStart({ start: previous, binMs, timeZone });
    if (next <= previous) throw new Error(`bin start ${next} is not after ${previous}`);
    starts.push(next);
  }
  return starts;
}

function isOnGrid({ start, binMs, timeZone }: { start: number; binMs: number; timeZone: string }): boolean {
  const anchor = binMs % WEEK_MS === 0 ? MONDAY_ANCHOR_MS : 0;
  const onLocalGrid = (start + offsetAt({ time: start, timeZone }) - anchor) % binMs === 0;
  const atTransition = offsetAt({ time: start - 1, timeZone }) !== offsetAt({ time: start, timeZone });
  return onLocalGrid || atTransition;
}

function windowsFor({ binMs, timeZone }: { binMs: number; timeZone: string }): [number, number][] {
  if (binMs >= WEEK_MS) return [[YEAR_START, LONG_END]];
  if (binMs >= HOUR_MS) return [[YEAR_START, YEAR_END]];
  return transitionsOf(timeZone).map((transition) => [transition - TRANSITION_WINDOW_MS, transition + TRANSITION_WINDOW_MS]);
}

const HARD_CASES = HARD_ZONES.flatMap((timeZone) => HARD_BIN_SIZES_MS.map((binMs) => [timeZone, binMs] as const));

test.each(HARD_CASES)(
  'in %s bins of %i ms strictly increase, sit on the local grid and contain every instant',
  (timeZone, binMs) => {
    windowsFor({ binMs, timeZone }).forEach(([from, to]) => {
      const starts = walkStarts({ from, to, binMs, timeZone });
      const startSet = new Set(starts);
      starts.forEach((start) => {
        expect(zonedBinStartOf({ time: start, binMs, timeZone })).toBe(start);
        expect(isOnGrid({ start, binMs, timeZone })).toBe(true);
      });
      const step = binMs >= HOUR_MS ? COARSE_SAMPLE_STEP_MS : FINE_SAMPLE_STEP_MS;
      const probes = Array.from({ length: Math.floor((to - from) / step) }, (_, index) => from + index * step);
      const failures = probes.filter((time) => {
        const start = zonedBinStartOf({ time, binMs, timeZone });
        return !(startSet.has(start) && start <= time && time < nextZonedBinStart({ start, binMs, timeZone }));
      });
      expect(failures).toEqual([]);
    });
  },
  120_000,
);

test('Chatham fall-back with 2 minute bins moves forward', () => {
  const binMs = 2 * MINUTE_MS;
  const start = zonedBinStartOf({ time: Date.UTC(2026, 3, 4, 14, 0), binMs, timeZone: CHATHAM });
  expect(nextZonedBinStart({ start, binMs, timeZone: CHATHAM })).toBeGreaterThan(start);
});

test('Chatham 2 minute bins walk the whole fall-back window', () => {
  const starts = walkStarts({
    from: Date.UTC(2026, 3, 4, 12, 0),
    to: Date.UTC(2026, 3, 4, 16, 0),
    binMs: 2 * MINUTE_MS,
    timeZone: CHATHAM,
  });
  expect(starts.length).toBeGreaterThan(100);
});

test('Troll 3 hour bins walk across the 2026-10-25 fall-back', () => {
  const starts = walkStarts({ from: Date.UTC(2026, 9, 18), to: Date.UTC(2026, 9, 31), binMs: 3 * HOUR_MS, timeZone: TROLL });
  expect(starts.length).toBeGreaterThan(100);
});

test('Jerusalem day bins start at local midnight', () => {
  const start = zonedBinStartOf({ time: Date.UTC(2026, 2, 27, 12, 0), binMs: DAY_MS, timeZone: JERUSALEM });
  expect((start + offsetAt({ time: start, timeZone: JERUSALEM })) % DAY_MS).toBe(0);
});

test('Santiago day bin whose midnight is skipped starts at the transition instant', () => {
  const start = zonedBinStartOf({ time: Date.UTC(2026, 8, 6, 12, 0), binMs: DAY_MS, timeZone: SANTIAGO });
  expect(offsetAt({ time: start - 1, timeZone: SANTIAGO })).not.toBe(offsetAt({ time: start, timeZone: SANTIAGO }));
});

test('Lord Howe keeps the short bin after the 30 minute gap', () => {
  const gap = Date.UTC(2026, 9, 3, 15, 30);
  const starts = walkStarts({ from: gap - 3 * HOUR_MS, to: gap + 3 * HOUR_MS, binMs: HOUR_MS, timeZone: LORD_HOWE });
  const lengths = starts.slice(1).map((start, index) => start - starts[index]);
  expect(lengths).toContain(30 * MINUTE_MS);
});
