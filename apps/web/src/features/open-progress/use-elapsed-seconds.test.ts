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

function renderElapsed({ resetKey, isRunning }: { resetKey: string; isRunning: boolean }) {
  return renderHook((props) => useElapsedSeconds(props), { initialProps: { resetKey, isRunning } });
}

test('it counts whole seconds while running', () => {
  const { result } = renderElapsed({ resetKey: 'doc-1', isRunning: true });
  expect(result.current).toBe(0);
  act(() => vi.advanceTimersByTime(3 * SECOND_MS));
  expect(result.current).toBe(3);
});

test('it keeps the last value and stops its timer when it stops running', () => {
  const { result, rerender } = renderElapsed({ resetKey: 'doc-1', isRunning: true });
  act(() => vi.advanceTimersByTime(2 * SECOND_MS));
  rerender({ resetKey: 'doc-1', isRunning: false });
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.advanceTimersByTime(5 * SECOND_MS));
  expect(result.current).toBe(2);
});

test('another key starts again from zero', () => {
  const { result, rerender } = renderElapsed({ resetKey: 'doc-1', isRunning: true });
  act(() => vi.advanceTimersByTime(4 * SECOND_MS));
  rerender({ resetKey: 'doc-2', isRunning: true });
  expect(result.current).toBe(0);
  act(() => vi.advanceTimersByTime(SECOND_MS));
  expect(result.current).toBe(1);
});
