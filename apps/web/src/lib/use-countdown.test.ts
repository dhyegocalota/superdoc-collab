import { SECOND_MS } from '@superdoc-collab/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useCountdown } from './use-countdown';

const COUNTDOWN_SECONDS = 3;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test('counts down each second to zero and stops there', () => {
  const untilMs = Date.now() + COUNTDOWN_SECONDS * SECOND_MS;
  const { result } = renderHook(() => useCountdown(untilMs));
  expect(result.current).toBe(COUNTDOWN_SECONDS);
  act(() => vi.advanceTimersByTime(SECOND_MS));
  expect(result.current).toBe(COUNTDOWN_SECONDS - 1);
  act(() => vi.advanceTimersByTime(SECOND_MS * 5));
  expect(result.current).toBe(0);
});

test('a null deadline reports null and runs no timer', () => {
  const { result } = renderHook(() => useCountdown(null));
  expect(result.current).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

test('the interval is cleared on unmount', () => {
  const untilMs = Date.now() + COUNTDOWN_SECONDS * SECOND_MS;
  const { unmount } = renderHook(() => useCountdown(untilMs));
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
