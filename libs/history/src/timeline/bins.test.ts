import { MINUTE_MS, SECOND_MS } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { MAX_BINS, binStartsCovering, buildBins, chooseBinMs } from './bins';
import type { EditRun } from './runs';

const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const TEN_OCLOCK = Date.UTC(2026, 9, 16, 10, 0);

function runAt({ time, binMs }: { time: number; binMs: number }): EditRun {
  return {
    binStart: Math.floor(time / binMs) * binMs,
    blockId: 'b1',
    bandId: 'b1',
    authorKeys: ['ana'],
    inserted: 'x',
    deleted: '',
    firstServerTime: time,
    lastServerTime: time,
    lastSequence: 1,
  };
}

test.each([
  [30 * SECOND_MS, 10 * SECOND_MS],
  [2 * MINUTE_MS, 10 * SECOND_MS],
  [10 * MINUTE_MS, 10 * SECOND_MS],
  [30 * MINUTE_MS, 30 * SECOND_MS],
  [3 * HOUR_MS, 2 * MINUTE_MS],
  [5 * HOUR_MS, 5 * MINUTE_MS],
  [30 * DAY_MS, 12 * HOUR_MS],
])('chooses the finest bin that fits for a span of %i ms', (spanMs, expected) => {
  expect(chooseBinMs(spanMs)).toBe(expected);
});

test('three years fall back to a whole number of weeks', () => {
  const binMs = chooseBinMs(3 * 365 * DAY_MS);
  expect(binMs % WEEK_MS).toBe(0);
});

const BIN_OFFSETS_MS = [0, 5 * SECOND_MS, 59 * SECOND_MS];

test.each([30 * SECOND_MS, 30 * MINUTE_MS, 119 * MINUTE_MS, 5 * HOUR_MS, 30 * DAY_MS, 3 * 365 * DAY_MS])(
  'a span of %i ms never draws more than MAX_BINS bins',
  (spanMs) => {
    const binMs = chooseBinMs(spanMs);
    BIN_OFFSETS_MS.forEach((offset) => {
      const firstTime = TEN_OCLOCK + offset;
      expect(binStartsCovering({ firstTime, lastTime: firstTime + spanMs, binMs }).length).toBeLessThanOrEqual(MAX_BINS);
    });
  },
);

test('a single edit yields three bins, the middle one filled', () => {
  const time = TEN_OCLOCK + 30 * SECOND_MS;
  const binStarts = binStartsCovering({ firstTime: time, lastTime: time, binMs: MINUTE_MS });
  expect(binStarts).toEqual([TEN_OCLOCK - MINUTE_MS, TEN_OCLOCK, TEN_OCLOCK + MINUTE_MS]);
  const bins = buildBins({ runs: [runAt({ time, binMs: MINUTE_MS })], binStarts, binMs: MINUTE_MS, versionSequenceAt: () => null });
  expect(bins.map((bin) => Object.keys(bin.byBand).length)).toEqual([0, 1, 0]);
});

test('bins between edits stay empty and carry the version before their end', () => {
  const first = TEN_OCLOCK;
  const last = TEN_OCLOCK + 3 * MINUTE_MS;
  const binStarts = binStartsCovering({ firstTime: first, lastTime: last, binMs: MINUTE_MS });
  const bins = buildBins({
    runs: [runAt({ time: first, binMs: MINUTE_MS }), runAt({ time: last, binMs: MINUTE_MS })],
    binStarts,
    binMs: MINUTE_MS,
    versionSequenceAt: (time) => time,
  });
  expect(bins).toHaveLength(6);
  const between = bins.slice(2, 4);
  expect(between.map((bin) => bin.byBand)).toEqual([{}, {}]);
  expect(between.every((bin) => bin.versionSequence !== null)).toBe(true);
});

test('a bin ending on a minute boundary resolves to the mark of its own minute', () => {
  const nextMinute = TEN_OCLOCK + MINUTE_MS;
  const bins = buildBins({
    runs: [],
    binStarts: [TEN_OCLOCK, nextMinute],
    binMs: MINUTE_MS,
    versionSequenceAt: (time) => (time >= nextMinute ? 9 : 5),
  });
  expect(bins.map((bin) => bin.versionSequence)).toEqual([5, 9]);
});
