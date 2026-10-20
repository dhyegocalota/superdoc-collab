import { SECOND_MS } from '@superdoc-collab/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useElapsedSeconds } from './use-elapsed-seconds';

const STARTED_AT = new Date('2026-10-19T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ now: STARTED_AT });
});

afterEach(() => {
  vi.useRealTimers();
});

test('it counts whole seconds since the start time', () => {
  const { result } = renderHook(() => useElapsedSeconds(STARTED_AT.getTime()));
  expect(result.current).toBe(0);
  act(() => vi.advanceTimersByTime(3 * SECOND_MS));
  expect(result.current).toBe(3);
});

test('a start time in the past counts from it', () => {
  const { result } = renderHook(() => useElapsedSeconds(STARTED_AT.getTime() - 10 * SECOND_MS));
  expect(result.current).toBe(10);
});

test('unmounting leaves no timer', () => {
  const { unmount } = renderHook(() => useElapsedSeconds(STARTED_AT.getTime()));
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
