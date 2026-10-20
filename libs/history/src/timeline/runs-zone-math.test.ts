import { MINUTE_MS } from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { groupIntoRuns, type TimelineEvent } from './runs';
import { zonedBinStartOf } from './zoned-time';

vi.mock('./zoned-time', async (importOriginal) => {
  const original = await importOriginal<typeof import('./zoned-time')>();
  return { ...original, zonedBinStartOf: vi.fn(original.zonedBinStartOf) };
});

const EVENT_COUNT = 50_000;
const BIN_COUNT = 100;
const FIRST_TIME = Date.UTC(2026, 9, 17, 0, 0);
const EVENT_SPACING_MS = (BIN_COUNT * MINUTE_MS) / EVENT_COUNT;

const EVENTS: TimelineEvent[] = Array.from({ length: EVENT_COUNT }, (_, index) => ({
  sequence: index,
  serverTime: FIRST_TIME + index * EVENT_SPACING_MS,
  blockId: 'b1',
  bandId: 'b1',
  authorKeys: ['ana'],
  inserted: 'x',
  deleted: '',
  commented: false,
}));

test('the zone math runs once per bin, not once per event', () => {
  const runs = groupIntoRuns({ events: EVENTS, binMs: MINUTE_MS, timeZone: 'America/Sao_Paulo' });
  expect(runs).toHaveLength(BIN_COUNT);
  expect(vi.mocked(zonedBinStartOf).mock.calls.length).toBeLessThanOrEqual(BIN_COUNT + 1);
});

test('events out of time order land in their own bins with bounded zone math', () => {
  vi.mocked(zonedBinStartOf).mockClear();
  const scattered = [5, 0, 3, 3, 9, 1].map((minute, index) => ({
    ...EVENTS[0]!,
    sequence: index,
    serverTime: FIRST_TIME + minute * MINUTE_MS + 1000,
  }));
  const runs = groupIntoRuns({ events: scattered, binMs: MINUTE_MS, timeZone: 'America/Sao_Paulo' });
  expect(runs.map((run) => run.binStart).sort((left, right) => left - right)).toEqual(
    [0, 1, 3, 5, 9].map((minute) => FIRST_TIME + minute * MINUTE_MS),
  );
  expect(vi.mocked(zonedBinStartOf).mock.calls.length).toBeLessThanOrEqual(5);
});
