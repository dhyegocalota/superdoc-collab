import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApiRequestError, RetryLaterError } from './api';
import { useResetAfterRetry } from './use-reset-after-retry';

const RETRY_AFTER_MS = 3000;
const TOO_SOON = new RetryLaterError({ message: 'Too soon', retryAfterMs: RETRY_AFTER_MS });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('a retry-later error resets once its wait is over', () => {
  const reset = vi.fn();
  renderHook(() => useResetAfterRetry({ error: TOO_SOON, reset }));
  vi.advanceTimersByTime(RETRY_AFTER_MS - 1);
  expect(reset).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(reset).toHaveBeenCalledTimes(1);
});

test('any other error, or none, never resets', () => {
  const reset = vi.fn();
  const { rerender } = renderHook(({ error }: { error: Error | null }) => useResetAfterRetry({ error, reset }), {
    initialProps: { error: new ApiRequestError('failed') as Error | null },
  });
  rerender({ error: null });
  vi.advanceTimersByTime(RETRY_AFTER_MS);
  expect(reset).not.toHaveBeenCalled();
});

test('unmounting before the wait cancels the reset', () => {
  const reset = vi.fn();
  const { unmount } = renderHook(() => useResetAfterRetry({ error: TOO_SOON, reset }));
  unmount();
  vi.advanceTimersByTime(RETRY_AFTER_MS);
  expect(reset).not.toHaveBeenCalled();
});
