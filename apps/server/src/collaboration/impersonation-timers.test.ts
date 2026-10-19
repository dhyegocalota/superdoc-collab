import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ImpersonationTimers } from './impersonation-timers';

const ONE_SECOND_MS = 1000;
const SOCKET_ID = 'socket-1';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('the end callback runs exactly when the impersonation hour ends', () => {
  const onEnd = vi.fn();
  new ImpersonationTimers().arm({ socketId: SOCKET_ID, endsAt: Date.now() + ONE_SECOND_MS, onEnd });
  vi.advanceTimersByTime(ONE_SECOND_MS - 1);
  expect(onEnd).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(onEnd).toHaveBeenCalledOnce();
});

test('clearing a socket cancels its timer', () => {
  const onEnd = vi.fn();
  const timers = new ImpersonationTimers();
  timers.arm({ socketId: SOCKET_ID, endsAt: Date.now() + ONE_SECOND_MS, onEnd });
  timers.clear(SOCKET_ID);
  vi.advanceTimersByTime(2 * ONE_SECOND_MS);
  expect(onEnd).not.toHaveBeenCalled();
});

test('an end already in the past runs at once', () => {
  const onEnd = vi.fn();
  new ImpersonationTimers().arm({ socketId: SOCKET_ID, endsAt: Date.now() - ONE_SECOND_MS, onEnd });
  vi.advanceTimersByTime(0);
  expect(onEnd).toHaveBeenCalledOnce();
});
