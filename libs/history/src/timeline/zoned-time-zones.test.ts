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
const COARSE_SAMPLE_STEP_MS = 53 * MINUTE_MS + 13 * SECOND_MS;
const DAILY_SAMPLE_STEP_MS = 5 * HOUR_MS + 7 * SECOND_MS;
const NEAR_TRANSITION_MS = 2 * HOUR_MS;
const NEAR_TRANSITION_STEP_MS = 29 * SECOND_MS + 11;
const FINE_SAMPLE_STEP_MS = 41 * SECOND_MS + 11;
const MONDAY_ANCHOR_MS = 4 * DAY_MS;

function transitionsOf(timeZone: string): number[] {
  const scanCount = (YEAR_END - YEAR_START) / TRANSITION_SCAN_STEP_MS;
  const scanTimes = Array.from({ length: scanCount }, (_, index) => YEAR_START + index * TRANSITION_SCAN_STEP_MS);
  return scanTimes.filter((time) => offsetAt({ time, timeZone }) !== offsetAt({ time: time - TRANSITION_SCAN_STEP_MS, timeZone }));
}

function walkStarts({ from, to, binMs, timeZone }: { from: number; to: number; binMs: number; timeZone: string }): number[] {
  let start = zonedBinStartOf({ time: from, binMs, timeZone });
  const starts = [start];
  while (start < to) {
    const next = nextZonedBinStart({ start, binMs, timeZone });
    if (next <= start) throw new Error(`bin start ${next} is not after ${start}`);
    starts.push(next);
    start = next;
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

function sampleStepFor(binMs: number): number {
  if (binMs >= DAY_MS) return DAILY_SAMPLE_STEP_MS;
  if (binMs >= HOUR_MS) return COARSE_SAMPLE_STEP_MS;
  return FINE_SAMPLE_STEP_MS;
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
      const step = sampleStepFor(binMs);
      const sweep = Array.from({ length: Math.floor((to - from) / step) }, (_, index) => from + index * step);
      const nearTransitions = transitionsOf(timeZone)
        .filter((transition) => transition > from && transition < to)
        .flatMap((transition) =>
          Array.from(
            { length: (2 * NEAR_TRANSITION_MS) / NEAR_TRANSITION_STEP_MS },
            (_, index) => transition - NEAR_TRANSITION_MS + index * NEAR_TRANSITION_STEP_MS,
          ),
        );
      const probes = [...sweep, ...nearTransitions];
      const failures = probes.filter((time) => {
        const start = zonedBinStartOf({ time, binMs, timeZone });
        return !(startSet.has(start) && start <= time && time < nextZonedBinStart({ start, binMs, timeZone }));
      });
      expect(failures).toEqual([]);
    });
  },
  120_000,
);

test('Santiago day bin whose midnight is skipped starts at the transition instant', () => {
  const start = zonedBinStartOf({ time: Date.UTC(2026, 8, 6, 12, 0), binMs: DAY_MS, timeZone: SANTIAGO });
  expect(offsetAt({ time: start - 1, timeZone: SANTIAGO })).not.toBe(offsetAt({ time: start, timeZone: SANTIAGO }));
});

test('Lord Howe keeps the short bin after the 30 minute gap', () => {
  const gap = Date.UTC(2026, 9, 3, 15, 30);
  const starts = walkStarts({ from: gap - 3 * HOUR_MS, to: gap + 3 * HOUR_MS, binMs: HOUR_MS, timeZone: LORD_HOWE });
  const lengths = starts.slice(1).map((start, index) => start - starts[index]!);
  expect(lengths).toContain(30 * MINUTE_MS);
});
