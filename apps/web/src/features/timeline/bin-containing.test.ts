import { HOUR_MS } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { timelineWith } from '@/testing/timeline-fixtures';
import { binContaining } from './bin-containing';

const timeline = timelineWith({ volumes: [[1], [2], [3]], names: ['Budget'] });
const secondBin = timeline.bins[1]!;
const lastBin = timeline.bins[2]!;

test('a time inside a bin finds that bin and its index', () => {
  expect(binContaining({ timeline, time: secondBin.start + 1 })).toEqual({ index: 1, bin: secondBin });
  expect(binContaining({ timeline, time: secondBin.start })).toEqual({ index: 1, bin: secondBin });
});

test('a bin that runs longer than the others owns its whole span', () => {
  const longBin = { ...secondBin, end: secondBin.end + HOUR_MS };
  const longTimeline = { ...timeline, bins: [timeline.bins[0]!, longBin, timeline.bins[2]!] };
  expect(binContaining({ timeline: longTimeline, time: longBin.end - 1 })).toEqual({ index: 1, bin: longBin });
});

test('a time outside every bin, no time or no timeline finds nothing', () => {
  expect(binContaining({ timeline, time: timeline.bins[0]!.start - 1 })).toBeNull();
  expect(binContaining({ timeline, time: lastBin.end })).toBeNull();
  expect(binContaining({ timeline, time: null })).toBeNull();
  expect(binContaining({ timeline: undefined, time: secondBin.start })).toBeNull();
});
