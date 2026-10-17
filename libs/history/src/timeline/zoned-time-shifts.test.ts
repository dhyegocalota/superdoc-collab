import { DAY_MS, HOUR_MS, SECOND_MS, WEEK_MS } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { BIN_LADDER_MS, binStartsCovering, chooseBinMs } from './bins';
import { nextZonedBinStart, offsetAt, zonedBinStartOf } from './zoned-time';

const CASEY = 'Antarctica/Casey';
const ROTHERA = 'Antarctica/Rothera';
const VOSTOK = 'Antarctica/Vostok';
const SHIFTED_ZONES = [CASEY, ROTHERA, VOSTOK];
const SCAN_START = Date.UTC(1970, 0, 1);
const SCAN_END = Date.UTC(2040, 0, 1);
const SCAN_STEP_MS = 14 * DAY_MS;
const SEARCH_PRECISION_MS = SECOND_MS;
const TRANSITIONS_PER_ZONE = 3;
const BINS_PER_WALK = 7;
const BINS_BEFORE_TRANSITION = 3;
const PROBE_FRACTIONS = [0, 0.5];
const ZONE_TEST_TIMEOUT_MS = 600_000;
const CASEY_FIRST_TIME = Date.UTC(2022, 1, 20);
const CASEY_LAST_TIME = Date.UTC(2022, 2, 25);
const CASEY_BIN_MS = 12 * HOUR_MS;
const ROTHERA_FIRST_TIME = Date.UTC(1976, 0, 1);
const VOSTOK_FIRST_TIME = Date.UTC(1994, 0, 1);
const HALF_YEAR_MS = 26 * WEEK_MS;
const ALL_ZONES = Intl.supportedValuesOf('timeZone');

function firstInstantWithNewOffset({ from, to, timeZone }: { from: number; to: number; timeZone: string }): number {
  if (to - from <= SEARCH_PRECISION_MS) return to;
  const middle = Math.floor((from + to) / 2);
  if (offsetAt({ time: middle, timeZone }) === offsetAt({ time: from, timeZone })) {
    return firstInstantWithNewOffset({ from: middle, to, timeZone });
  }
  return firstInstantWithNewOffset({ from, to: middle, timeZone });
}

function transitionsOf(timeZone: string): number[] {
  const scanTimes = Array.from({ length: (SCAN_END - SCAN_START) / SCAN_STEP_MS }, (_, index) => SCAN_START + index * SCAN_STEP_MS);
  return scanTimes
    .filter((time) => offsetAt({ time, timeZone }) !== offsetAt({ time: time - SCAN_STEP_MS, timeZone }))
    .map((time) => firstInstantWithNewOffset({ from: time - SCAN_STEP_MS, to: time, timeZone }));
}

function sampledTransitions(timeZone: string): number[] {
  const transitions = transitionsOf(timeZone);
  const stride = Math.max(1, Math.floor(transitions.length / TRANSITIONS_PER_ZONE));
  return transitions.filter((_, index) => index % stride === 0).slice(0, TRANSITIONS_PER_ZONE);
}

function failuresAt({ timeZone, transition, binMs }: { timeZone: string; transition: number; binMs: number }): string[] {
  const firstStart = zonedBinStartOf({ time: transition - BINS_BEFORE_TRANSITION * binMs, binMs, timeZone });
  const starts = Array.from({ length: BINS_PER_WALK }).reduce<number[]>(
    (walked) => [...walked, nextZonedBinStart({ start: walked[walked.length - 1]!, binMs, timeZone })],
    [firstStart],
  );
  const isStalled = starts.some((start, index) => index > 0 && start <= starts[index - 1]!);
  const isUncontained = PROBE_FRACTIONS.map((fraction) => transition + fraction * binMs).some((time) => {
    const start = zonedBinStartOf({ time, binMs, timeZone });
    return !(start <= time && time < nextZonedBinStart({ start, binMs, timeZone }));
  });
  if (isStalled || isUncontained) return [`${timeZone} ${new Date(transition).toISOString()} ${binMs}`];
  return [];
}

function nonAdvancingCases({ timeZone, transitions }: { timeZone: string; transitions: number[] }): string[] {
  return transitions.flatMap((transition) => BIN_LADDER_MS.flatMap((binMs) => failuresAt({ timeZone, transition, binMs })));
}

function isStrictlyIncreasing(starts: number[]): boolean {
  return starts.every((start, index) => index === 0 || start > starts[index - 1]!);
}

test.each(SHIFTED_ZONES)(
  '%s bins advance across every transition for every ladder size',
  (timeZone) => {
    expect(nonAdvancingCases({ timeZone, transitions: transitionsOf(timeZone) })).toEqual([]);
  },
  ZONE_TEST_TIMEOUT_MS,
);

test('Casey 12 hour bins cover 2022-02-20 to 2022-03-25 across its 3 hour shift', () => {
  expect(chooseBinMs(CASEY_LAST_TIME - CASEY_FIRST_TIME)).toBe(CASEY_BIN_MS);
  const starts = binStartsCovering({ firstTime: CASEY_FIRST_TIME, lastTime: CASEY_LAST_TIME, binMs: CASEY_BIN_MS, timeZone: CASEY });
  expect(isStrictlyIncreasing(starts)).toBe(true);
});

test('Rothera and Vostok week bins cover their historical shifts', () => {
  const rotheraStarts = binStartsCovering({
    firstTime: ROTHERA_FIRST_TIME,
    lastTime: ROTHERA_FIRST_TIME + HALF_YEAR_MS,
    binMs: WEEK_MS,
    timeZone: ROTHERA,
  });
  const vostokStarts = binStartsCovering({
    firstTime: VOSTOK_FIRST_TIME,
    lastTime: VOSTOK_FIRST_TIME + HALF_YEAR_MS,
    binMs: WEEK_MS,
    timeZone: VOSTOK,
  });
  expect(isStrictlyIncreasing(rotheraStarts)).toBe(true);
  expect(isStrictlyIncreasing(vostokStarts)).toBe(true);
});

test(
  'bins strictly advance in every supported zone across its sampled 1970 to 2040 transitions',
  () => {
    const failures = ALL_ZONES.flatMap((timeZone) => nonAdvancingCases({ timeZone, transitions: sampledTransitions(timeZone) }));
    expect(failures).toEqual([]);
  },
  ZONE_TEST_TIMEOUT_MS,
);
