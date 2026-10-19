import { LIVE_ANNOUNCE_MS } from '@superdoc-collab/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { liveEditsLabel } from './timeline-copy';
import type { TimelineChange } from './use-timeline-change';
import { useLiveAnnouncement } from './use-live-announcement';

const BAND_ID = 'band-0';

function changeWith(token: number): TimelineChange {
  return { token, binIndex: 0, bandId: BAND_ID };
}

function render(initial: TimelineChange | null) {
  return renderHook(({ change }) => useLiveAnnouncement({ change }), { initialProps: { change: initial } });
}

function elapse(milliseconds: number): void {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
afterEach(() => vi.useRealTimers());

test('nothing is announced for a change that was there when the cue mounted', () => {
  const { result } = render(changeWith(1));
  expect(result.current).toBe('');
});

test('the first change is announced at once', () => {
  const { result, rerender } = render(null);
  rerender({ change: changeWith(1) });
  expect(result.current).toBe(liveEditsLabel(1));
});

test('changes inside the window wait and are announced together when it ends', () => {
  const { result, rerender } = render(null);
  rerender({ change: changeWith(1) });
  elapse(LIVE_ANNOUNCE_MS / 5);
  rerender({ change: changeWith(2) });
  elapse(LIVE_ANNOUNCE_MS / 5);
  rerender({ change: changeWith(3) });
  expect(result.current).toBe(liveEditsLabel(1));
  elapse(LIVE_ANNOUNCE_MS - (2 * LIVE_ANNOUNCE_MS) / 5 - 1);
  expect(result.current).toBe(liveEditsLabel(1));
  elapse(1);
  expect(result.current).toBe(liveEditsLabel(2));
});

test('a change after the window is announced at once again', () => {
  const { result, rerender } = render(null);
  rerender({ change: changeWith(1) });
  elapse(LIVE_ANNOUNCE_MS);
  rerender({ change: changeWith(2) });
  expect(result.current).toBe(liveEditsLabel(1));
});

test('unmounting clears the pending announcement', () => {
  const { rerender, unmount } = render(null);
  rerender({ change: changeWith(1) });
  rerender({ change: changeWith(2) });
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
