import { MINUTE_MS, type DocumentTimeline } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { timelineWith } from '@/testing/timeline-fixtures';
import { idleBreaksOf } from './idle-breaks';

const THRESHOLD_MS = 5 * MINUTE_MS;
const THRESHOLD_BINS = 5;
const EDITED = [5];
const EMPTY = [0];

function timelineOf(...runs: number[][][]) {
  return timelineWith({ volumes: runs.flat(), names: ['Budget'] });
}

function emptyBins(count: number): number[][] {
  return Array.from({ length: count }, () => EMPTY);
}

test('a run of exactly the threshold is not a break', () => {
  const timeline = timelineOf([EDITED], emptyBins(THRESHOLD_BINS), [EDITED]);
  expect(idleBreaksOf({ timeline, thresholdMs: THRESHOLD_MS })).toEqual([]);
});

test('a run one bin longer than the threshold is a break', () => {
  const timeline = timelineOf([EDITED], emptyBins(THRESHOLD_BINS + 1), [EDITED]);
  expect(idleBreaksOf({ timeline, thresholdMs: THRESHOLD_MS })).toEqual([
    { firstIndex: 1, lastIndex: THRESHOLD_BINS + 1, durationMs: (THRESHOLD_BINS + 1) * MINUTE_MS },
  ]);
});

test('a run touching the first bin is not a break', () => {
  const timeline = timelineOf(emptyBins(THRESHOLD_BINS + 3), [EDITED]);
  expect(idleBreaksOf({ timeline, thresholdMs: THRESHOLD_MS })).toEqual([]);
});

test('a run touching the last bin is not a break', () => {
  const timeline = timelineOf([EDITED], emptyBins(THRESHOLD_BINS + 3));
  expect(idleBreaksOf({ timeline, thresholdMs: THRESHOLD_MS })).toEqual([]);
});

test('two runs give two breaks in index order', () => {
  const run = THRESHOLD_BINS + 1;
  const timeline = timelineOf([EDITED], emptyBins(run), [EDITED], emptyBins(run), [EDITED]);
  expect(idleBreaksOf({ timeline, thresholdMs: THRESHOLD_MS })).toEqual([
    { firstIndex: 1, lastIndex: run, durationMs: run * MINUTE_MS },
    { firstIndex: run + 2, lastIndex: 2 * run + 1, durationMs: run * MINUTE_MS },
  ]);
});

test('a run split by one bin with volume gives two runs under the threshold', () => {
  const half = THRESHOLD_BINS - 1;
  const timeline = timelineOf([EDITED], emptyBins(half), [EDITED], emptyBins(half), [EDITED]);
  expect(idleBreaksOf({ timeline, thresholdMs: THRESHOLD_MS })).toEqual([]);
});

test('a bin is empty when every band has zero volume in it', () => {
  const timeline = timelineWith({
    volumes: [[5, 5], ...Array.from({ length: THRESHOLD_BINS + 1 }, () => [0, 0]), [5, 5]],
    names: ['Budget', 'Hiring'],
  });
  expect(idleBreaksOf({ timeline, thresholdMs: THRESHOLD_MS })).toHaveLength(1);
  const oneBandActive = timelineWith({
    volumes: [[5, 5], ...Array.from({ length: THRESHOLD_BINS + 1 }, () => [0, 1]), [5, 5]],
    names: ['Budget', 'Hiring'],
  });
  expect(idleBreaksOf({ timeline: oneBandActive, thresholdMs: THRESHOLD_MS })).toEqual([]);
});

const VERSION_SEQUENCE = 7;

function withVersionSequences({ timeline, sequences }: { timeline: DocumentTimeline; sequences: (number | null)[] }): DocumentTimeline {
  return { ...timeline, bins: timeline.bins.map((bin, index) => ({ ...bin, versionSequence: sequences[index]! })) };
}

test('an empty bin that carries a new version ends the run before it', () => {
  const run = THRESHOLD_BINS + 1;
  const timeline = timelineOf([EDITED], emptyBins(run), [EDITED]);
  const sequences = timeline.bins.map((_, index) => (index > run / 2 ? VERSION_SEQUENCE : null));
  expect(idleBreaksOf({ timeline: withVersionSequences({ timeline, sequences }), thresholdMs: THRESHOLD_MS })).toEqual([]);
});

test('empty bins that repeat the previous version stay one run', () => {
  const run = THRESHOLD_BINS + 1;
  const timeline = timelineOf([EDITED], emptyBins(run), [EDITED]);
  const sequences = timeline.bins.map(() => VERSION_SEQUENCE);
  expect(idleBreaksOf({ timeline: withVersionSequences({ timeline, sequences }), thresholdMs: THRESHOLD_MS })).toHaveLength(1);
});
