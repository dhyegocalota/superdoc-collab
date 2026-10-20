import { OPEN_PROGRESS_DELAY_MS } from '@superdoc-collab/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useDelayedReveal } from './use-delayed-reveal';

const ONE_MILLISECOND = 1;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderReveal(resetKey: string) {
  return renderHook(({ key }) => useDelayedReveal({ delayMs: OPEN_PROGRESS_DELAY_MS, resetKey: key }), { initialProps: { key: resetKey } });
}

test('nothing shows before the delay and it shows at the delay', () => {
  const { result } = renderReveal('doc-1');
  expect(result.current).toBe(false);
  act(() => vi.advanceTimersByTime(OPEN_PROGRESS_DELAY_MS - ONE_MILLISECOND));
  expect(result.current).toBe(false);
  act(() => vi.advanceTimersByTime(ONE_MILLISECOND));
  expect(result.current).toBe(true);
});

test('once shown it stays shown', () => {
  const { result, rerender } = renderReveal('doc-1');
  act(() => vi.advanceTimersByTime(OPEN_PROGRESS_DELAY_MS));
  rerender({ key: 'doc-1' });
  act(() => vi.advanceTimersByTime(OPEN_PROGRESS_DELAY_MS * 10));
  expect(result.current).toBe(true);
});

test('another key hides it and restarts the clock', () => {
  const { result, rerender } = renderReveal('doc-1');
  act(() => vi.advanceTimersByTime(OPEN_PROGRESS_DELAY_MS));
  rerender({ key: 'doc-2' });
  expect(result.current).toBe(false);
  act(() => vi.advanceTimersByTime(OPEN_PROGRESS_DELAY_MS));
  expect(result.current).toBe(true);
});

test('unmounting before the delay leaves no timer', () => {
  const { unmount } = renderReveal('doc-1');
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
