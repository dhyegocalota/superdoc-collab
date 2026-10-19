import { STREAMGRAPH_PULSE_MS } from '@superdoc-collab/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { TimelineChange } from './use-timeline-change';
import { useChangePulse } from './use-change-pulse';

const FIRST: TimelineChange = { token: 1, binIndex: 2, bandId: 'band-0' };
const SECOND: TimelineChange = { token: 2, binIndex: 3, bandId: 'band-1' };
const HALF_PULSE_MS = STREAMGRAPH_PULSE_MS / 2;

type Props = { change: TimelineChange | null; isSuppressed: boolean };

function render(initial: Props) {
  return renderHook((props: Props) => useChangePulse(props), { initialProps: initial });
}

function elapse(milliseconds: number): void {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('a change that was already there when the chart mounted does not pulse', () => {
  const { result } = render({ change: FIRST, isSuppressed: false });
  expect(result.current).toBeNull();
});

test('a new change pulses once for the pulse duration and then settles', () => {
  const { result, rerender } = render({ change: null, isSuppressed: false });
  rerender({ change: FIRST, isSuppressed: false });
  expect(result.current).toBe(FIRST);
  elapse(STREAMGRAPH_PULSE_MS - 1);
  expect(result.current).toBe(FIRST);
  elapse(1);
  expect(result.current).toBeNull();
  rerender({ change: FIRST, isSuppressed: false });
  expect(result.current).toBeNull();
});

test('a newer change during a pulse replaces it and restarts the duration', () => {
  const { result, rerender } = render({ change: null, isSuppressed: false });
  rerender({ change: FIRST, isSuppressed: false });
  elapse(HALF_PULSE_MS);
  rerender({ change: SECOND, isSuppressed: false });
  expect(result.current).toBe(SECOND);
  elapse(HALF_PULSE_MS);
  expect(result.current).toBe(SECOND);
  elapse(HALF_PULSE_MS);
  expect(result.current).toBeNull();
});

test('a change that arrives while suppressed never pulses, not even once suppression ends', () => {
  const { result, rerender } = render({ change: null, isSuppressed: true });
  rerender({ change: FIRST, isSuppressed: true });
  expect(result.current).toBeNull();
  rerender({ change: FIRST, isSuppressed: false });
  expect(result.current).toBeNull();
});

test('unmounting clears the timer', () => {
  const { rerender, unmount } = render({ change: null, isSuppressed: false });
  rerender({ change: FIRST, isSuppressed: false });
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
