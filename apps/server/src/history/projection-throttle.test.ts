import { expect, test, vi } from 'vitest';
import { PROJECTION_THROTTLE_MS, ProjectionThrottle } from './projection-throttle';

test('requests inside one interval run once, after the interval', () => {
  vi.useFakeTimers();
  const run = vi.fn();
  const throttle = new ProjectionThrottle({ intervalMs: PROJECTION_THROTTLE_MS, run });
  Array.from({ length: 5 }).forEach(() => throttle.request('d1'));
  throttle.request('d2');
  vi.advanceTimersByTime(PROJECTION_THROTTLE_MS - 1);
  expect(run).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(run.mock.calls).toEqual([['d1'], ['d2']]);
  throttle.request('d1');
  vi.advanceTimersByTime(PROJECTION_THROTTLE_MS);
  expect(run).toHaveBeenCalledTimes(3);
  vi.useRealTimers();
});

test('stop clears every pending run', () => {
  vi.useFakeTimers();
  const run = vi.fn();
  const throttle = new ProjectionThrottle({ intervalMs: PROJECTION_THROTTLE_MS, run });
  throttle.request('d1');
  throttle.stop();
  vi.advanceTimersByTime(PROJECTION_THROTTLE_MS);
  expect(run).not.toHaveBeenCalled();
  vi.useRealTimers();
});
