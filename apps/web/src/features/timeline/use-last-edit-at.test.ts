import { LAST_EDIT_MARK_INTERVAL_MS } from '@superdoc-collab/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useLastEditAt } from './use-last-edit-at';

const START_MS = 1_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START_MS);
});
afterEach(() => vi.useRealTimers());

test('there is no edit until one is marked', () => {
  const { result } = renderHook(() => useLastEditAt());
  expect(result.current.lastEditAt).toBeNull();
});

test('marking an edit records the time of the edit', () => {
  const { result } = renderHook(() => useLastEditAt());
  act(() => result.current.markEdit());
  expect(result.current.lastEditAt).toBe(START_MS);
});

test('marks inside one interval do not move the recorded time', () => {
  const { result } = renderHook(() => useLastEditAt());
  act(() => result.current.markEdit());
  vi.advanceTimersByTime(LAST_EDIT_MARK_INTERVAL_MS - 1);
  act(() => result.current.markEdit());
  expect(result.current.lastEditAt).toBe(START_MS);
});

test('a mark after the interval records the new time', () => {
  const { result } = renderHook(() => useLastEditAt());
  act(() => result.current.markEdit());
  vi.advanceTimersByTime(LAST_EDIT_MARK_INTERVAL_MS);
  act(() => result.current.markEdit());
  expect(result.current.lastEditAt).toBe(START_MS + LAST_EDIT_MARK_INTERVAL_MS);
});

test('markEdit keeps its identity across renders', () => {
  const { result, rerender } = renderHook(() => useLastEditAt());
  const first = result.current.markEdit;
  act(() => result.current.markEdit());
  rerender();
  expect(result.current.markEdit).toBe(first);
});
