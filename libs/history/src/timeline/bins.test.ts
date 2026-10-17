import { DAY_MS, HOUR_MS, MINUTE_MS, SECOND_MS, WEEK_MS } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { MAX_BINS, NonAdvancingBinError, TooManyBinsError, binStartsCovering, buildBins, chooseBinMs } from './bins';
import type { EditRun } from './runs';
import { offsetAt, zonedBinStartOf } from './zoned-time';

const UTC = 'UTC';
const SAO_PAULO = 'America/Sao_Paulo';
const LISBON = 'Europe/Lisbon';
const NEW_YORK = 'America/New_York';
const CHATHAM = 'Pacific/Chatham';
const LORD_HOWE = 'Australia/Lord_Howe';
const KATHMANDU = 'Asia/Kathmandu';
const KIRITIMATI = 'Pacific/Kiritimati';
const TEN_OCLOCK = Date.UTC(2026, 9, 16, 10, 0);

function runAt({ time, binMs }: { time: number; binMs: number }): EditRun {
  return {
    binStart: zonedBinStartOf({ time, binMs, timeZone: UTC }),
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

const LADDER_SPANS_MS = [30 * SECOND_MS, 30 * MINUTE_MS, 119 * MINUTE_MS, 5 * HOUR_MS, 30 * DAY_MS, 3 * 365 * DAY_MS];
const COVERING_CASES = [UTC, SAO_PAULO, LISBON, NEW_YORK, KATHMANDU, KIRITIMATI].flatMap((timeZone) =>
  LADDER_SPANS_MS.map((spanMs) => [timeZone, spanMs] as const),
);

test.each(COVERING_CASES)('in %s a span of %i ms never draws more than MAX_BINS bins', (timeZone, spanMs) => {
  const binMs = chooseBinMs(spanMs);
  BIN_OFFSETS_MS.forEach((offset) => {
    const firstTime = TEN_OCLOCK + offset;
    expect(binStartsCovering({ firstTime, lastTime: firstTime + spanMs, binMs, timeZone }).length).toBeLessThanOrEqual(MAX_BINS);
  });
});

test('a single edit yields three bins, the middle one filled', () => {
  const time = TEN_OCLOCK + 30 * SECOND_MS;
  const binStarts = binStartsCovering({ firstTime: time, lastTime: time, binMs: MINUTE_MS, timeZone: UTC });
  expect(binStarts).toEqual([TEN_OCLOCK - MINUTE_MS, TEN_OCLOCK, TEN_OCLOCK + MINUTE_MS]);
  const bins = buildBins({
    runs: [runAt({ time, binMs: MINUTE_MS })],
    binStarts,
    binMs: MINUTE_MS,
    timeZone: UTC,
    versionSequenceAt: () => null,
  });
  expect(bins.map((bin) => Object.keys(bin.byBand).length)).toEqual([0, 1, 0]);
});

test('bins between edits stay empty and carry the version before their end', () => {
  const first = TEN_OCLOCK;
  const last = TEN_OCLOCK + 3 * MINUTE_MS;
  const binStarts = binStartsCovering({ firstTime: first, lastTime: last, binMs: MINUTE_MS, timeZone: UTC });
  const bins = buildBins({
    runs: [runAt({ time: first, binMs: MINUTE_MS }), runAt({ time: last, binMs: MINUTE_MS })],
    binStarts,
    binMs: MINUTE_MS,
    timeZone: UTC,
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
    timeZone: UTC,
    versionSequenceAt: (time) => (time >= nextMinute ? 9 : 5),
  });
  expect(bins.map((bin) => bin.versionSequence)).toEqual([5, 9]);
});

const LOCAL_DAY_START = Date.UTC(2026, 9, 14, 3, 0);

test('a day timeline in Sao Paulo starts every bin at local midnight and chains them', () => {
  const binStarts = binStartsCovering({
    firstTime: LOCAL_DAY_START + HOUR_MS,
    lastTime: LOCAL_DAY_START + 5 * DAY_MS + HOUR_MS,
    binMs: DAY_MS,
    timeZone: SAO_PAULO,
  });
  const bins = buildBins({ runs: [], binStarts, binMs: DAY_MS, timeZone: SAO_PAULO, versionSequenceAt: () => null });
  expect(bins).toHaveLength(8);
  expect(bins.map((bin) => (bin.start + offsetAt({ time: bin.start, timeZone: SAO_PAULO })) % DAY_MS)).toEqual(Array(8).fill(0));
  bins.slice(1).forEach((bin, index) => expect(bins.at(index)?.end).toBe(bin.start));
});

test('padding is one empty bin each side of the first and last edit', () => {
  const time = Date.UTC(2026, 9, 17, 12, 0);
  const binStarts = binStartsCovering({ firstTime: time, lastTime: time, binMs: DAY_MS, timeZone: SAO_PAULO });
  expect(binStarts).toEqual([Date.UTC(2026, 9, 16, 3, 0), Date.UTC(2026, 9, 17, 3, 0), Date.UTC(2026, 9, 18, 3, 0)]);
});

test('a Lisbon autumn day bin is 25 hours long and resolves its version at end - 1', () => {
  const binStarts = binStartsCovering({
    firstTime: Date.UTC(2026, 9, 25, 12, 0),
    lastTime: Date.UTC(2026, 9, 25, 12, 0),
    binMs: DAY_MS,
    timeZone: LISBON,
  });
  const resolvedAt: number[] = [];
  const bins = buildBins({
    runs: [],
    binStarts,
    binMs: DAY_MS,
    timeZone: LISBON,
    versionSequenceAt: (time) => {
      resolvedAt.push(time);
      return null;
    },
  });
  const autumn = bins.find((bin) => bin.start === Date.UTC(2026, 9, 24, 23, 0));
  expect(autumn?.end).toBe(Date.UTC(2026, 9, 26, 0, 0));
  expect(resolvedAt).toContain(Date.UTC(2026, 9, 26, 0, 0) - 1);
});

test('a week timeline in Kiritimati starts every bin on a local Monday', () => {
  const binStarts = binStartsCovering({
    firstTime: Date.UTC(2026, 9, 12, 12, 0),
    lastTime: Date.UTC(2026, 9, 12, 12, 0) + 3 * WEEK_MS,
    binMs: WEEK_MS,
    timeZone: KIRITIMATI,
  });
  expect(binStarts.map((start) => (start + offsetAt({ time: start, timeZone: KIRITIMATI })) % WEEK_MS)).toEqual(
    Array(binStarts.length).fill(4 * DAY_MS),
  );
});

test('Chatham 2 minute bins cover the fall-back without recursing forever', () => {
  const binStarts = binStartsCovering({
    firstTime: Date.UTC(2026, 3, 4, 13, 50),
    lastTime: Date.UTC(2026, 3, 4, 14, 10),
    binMs: 2 * MINUTE_MS,
    timeZone: CHATHAM,
  });
  expect(binStarts.every((start, index) => index === 0 || start > binStarts[index - 1]!)).toBe(true);
});

test.each([
  [CHATHAM, Date.UTC(2026, 3, 4, 14, 0), HOUR_MS],
  [CHATHAM, Date.UTC(2026, 8, 26, 14, 0), HOUR_MS],
  [CHATHAM, Date.UTC(2026, 8, 26, 14, 0), 2 * MINUTE_MS],
  [LORD_HOWE, Date.UTC(2026, 9, 3, 15, 40), HOUR_MS],
])('in %s an edit at %i in a bin of %i ms lands in one of the covering bins', (timeZone, time, binMs) => {
  const binStarts = binStartsCovering({ firstTime: time - 10 * MINUTE_MS, lastTime: time + 10 * MINUTE_MS, binMs, timeZone });
  expect(binStarts).toContain(zonedBinStartOf({ time, binMs, timeZone }));
});

test('a span that needs more than MAX_BINS bins is refused instead of walked', () => {
  const firstTime = TEN_OCLOCK;
  expect(() => binStartsCovering({ firstTime, lastTime: firstTime + 7 * DAY_MS, binMs: MINUTE_MS, timeZone: UTC })).toThrow(
    TooManyBinsError,
  );
});

test('the non advancing bin error names both instants', () => {
  expect(new NonAdvancingBinError({ start: 5, next: 3 }).message).toContain('3');
});
