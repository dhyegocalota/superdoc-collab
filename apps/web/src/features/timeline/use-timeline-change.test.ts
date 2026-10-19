import { MINUTE_MS } from '@superdoc-collab/types';
import { renderHook } from '@testing-library/react';
import { expect, test } from 'vitest';
import { timelineWith } from '@/testing/timeline-fixtures';
import { useTimelineChange } from './use-timeline-change';

const SCOPE = 'everything';
const OTHER_SCOPE = 'only Bruno';
const NAMES = ['Budget', 'Hiring'];
const base = timelineWith({
  volumes: [
    [10, 5],
    [20, 5],
  ],
  names: NAMES,
});
const [budget, hiring] = base.bands;

function render(initial: typeof base | undefined) {
  return renderHook(({ timeline, scope }) => useTimelineChange({ timeline, scope }), { initialProps: { timeline: initial, scope: SCOPE } });
}

test('the first answer is a baseline, not a change', () => {
  const { result } = render(base);
  expect(result.current).toBeNull();
});

test('an answer with no timeline yet is no change', () => {
  const { result, rerender } = render(undefined);
  rerender({ timeline: undefined, scope: SCOPE });
  expect(result.current).toBeNull();
});

test('the newest bin whose volume grew is the change, with the band that grew most', () => {
  const { result, rerender } = render(base);
  const grown = timelineWith({
    volumes: [
      [15, 5],
      [20, 9],
    ],
    names: NAMES,
  });
  rerender({ timeline: grown, scope: SCOPE });
  expect(result.current).toEqual({ token: 1, binIndex: 1, bandId: hiring!.id });
});

test('a bin that appears counts as grown', () => {
  const { result, rerender } = render(base);
  const longer = timelineWith({
    volumes: [
      [10, 5],
      [20, 5],
      [7, 1],
    ],
    names: NAMES,
  });
  rerender({ timeline: longer, scope: SCOPE });
  expect(result.current).toEqual({ token: 1, binIndex: 2, bandId: budget!.id });
});

test('an equal answer in a new object is no change', () => {
  const { result, rerender } = render(base);
  rerender({ timeline: structuredClone(base), scope: SCOPE });
  expect(result.current).toBeNull();
});

test('a shrinking answer is no change and keeps the last change as it was', () => {
  const { result, rerender } = render(base);
  const grown = timelineWith({
    volumes: [
      [10, 5],
      [30, 5],
    ],
    names: NAMES,
  });
  rerender({ timeline: grown, scope: SCOPE });
  const change = result.current;
  rerender({ timeline: base, scope: SCOPE });
  expect(result.current).toBe(change);
});

test('every growing answer is a new change with the next token', () => {
  const { result, rerender } = render(base);
  const once = timelineWith({
    volumes: [
      [10, 5],
      [30, 5],
    ],
    names: NAMES,
  });
  const twice = timelineWith({
    volumes: [
      [10, 5],
      [40, 5],
    ],
    names: NAMES,
  });
  rerender({ timeline: once, scope: SCOPE });
  rerender({ timeline: twice, scope: SCOPE });
  expect(result.current!.token).toBe(2);
});

test('a new scope restarts the baseline instead of pulsing the difference', () => {
  const { result, rerender } = render(base);
  const filtered = timelineWith({
    volumes: [
      [99, 5],
      [99, 5],
    ],
    names: NAMES,
  });
  rerender({ timeline: filtered, scope: OTHER_SCOPE });
  expect(result.current).toBeNull();
});

test('a new bin size restarts the baseline instead of pulsing the re-bucketed bins', () => {
  const { result, rerender } = render(base);
  const coarser = { ...base, binMs: base.binMs + MINUTE_MS, bins: base.bins.map((bin) => ({ ...bin, start: bin.start + 1 })) };
  rerender({ timeline: coarser, scope: SCOPE });
  expect(result.current).toBeNull();
});
