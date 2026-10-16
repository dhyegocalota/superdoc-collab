import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useDebouncedCallback } from './use-debounced-callback';

const DELAY_MS = 300;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('calls within the delay collapse into the last one', () => {
  const callback = vi.fn();
  const { result } = renderHook(() => useDebouncedCallback({ callback, delayMs: DELAY_MS }));
  result.current(1);
  vi.advanceTimersByTime(DELAY_MS - 1);
  result.current(2);
  vi.advanceTimersByTime(DELAY_MS - 1);
  result.current(3);
  expect(callback).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith(3);
});

test('unmounting cancels a pending call', () => {
  const callback = vi.fn();
  const { result, unmount } = renderHook(() => useDebouncedCallback({ callback, delayMs: DELAY_MS }));
  result.current(1);
  unmount();
  vi.advanceTimersByTime(DELAY_MS * 2);
  expect(callback).not.toHaveBeenCalled();
});
