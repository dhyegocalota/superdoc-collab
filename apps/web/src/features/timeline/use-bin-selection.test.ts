import { act, renderHook } from '@testing-library/react';
import type { DocumentTimeline } from '@superdoc-history/types';
import { expect, test, vi } from 'vitest';
import { timelineWith } from '@/testing/timeline-fixtures';
import { useBinSelection } from './use-bin-selection';

const VERSION_SEQUENCE = 7;
const base = timelineWith({ volumes: [[1], [2], [3]], names: ['Budget'] });
const timeline: DocumentTimeline = {
  ...base,
  bins: base.bins.map((bin, index) => (index === 2 ? { ...bin, versionSequence: VERSION_SEQUENCE } : bin)),
};

function renderSelection(at: number | null) {
  const onTravel = vi.fn();
  const onBackToLive = vi.fn();
  const hook = renderHook((props: { at: number | null }) => useBinSelection({ timeline, at: props.at, onTravel, onBackToLive }), {
    initialProps: { at },
  });
  return { ...hook, onTravel, onBackToLive };
}

test('the selection starts at the moment in the URL and follows it', () => {
  const { result, rerender } = renderSelection(timeline.bins[1]!.start);
  expect(result.current.selectedIndex).toBe(1);
  expect(result.current.selectedBin).toEqual(timeline.bins[1]);
  rerender({ at: null });
  expect(result.current.selectedIndex).toBeNull();
  expect(result.current.selectedBin).toBeNull();
});

test('selecting a bin with a version travels to it, a bin without one only selects it', () => {
  const { result, onTravel } = renderSelection(null);
  act(() => result.current.selectIndex(0));
  expect(result.current.selectedIndex).toBe(0);
  expect(onTravel).not.toHaveBeenCalled();
  act(() => result.current.selectIndex(2));
  expect(result.current.selectedIndex).toBe(2);
  expect(onTravel).toHaveBeenCalledWith(timeline.bins[2]!.start);
});

test('clearing the selection goes back to live', () => {
  const { result, onBackToLive } = renderSelection(timeline.bins[1]!.start);
  act(() => result.current.clearSelection());
  expect(result.current.selectedIndex).toBeNull();
  expect(onBackToLive).toHaveBeenCalledTimes(1);
});
