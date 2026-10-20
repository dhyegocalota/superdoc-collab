import {
  ConnectionFailureReason,
  HEAVY_ROOMS_FULL_MESSAGE,
  HEAVY_ROOMS_RETRY_AFTER_MS,
  HEAVY_ROOMS_USER_CAP_MESSAGE,
} from '@superdoc-collab/types';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useHeavyRoomsRetry } from './use-heavy-rooms-retry';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test('a refusal because the heavy rooms are full reloads once the server said to wait, and not before', () => {
  const reload = vi.fn();
  renderHook(() =>
    useHeavyRoomsRetry({ failureReason: ConnectionFailureReason.HeavyRoomsFull, failureMessage: HEAVY_ROOMS_FULL_MESSAGE, reload }),
  );
  vi.advanceTimersByTime(HEAVY_ROOMS_RETRY_AFTER_MS - 1);
  expect(reload).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(reload).toHaveBeenCalledOnce();
});

test('a refusal because the user holds too many large documents never reloads by itself, since only the user can change it', () => {
  const reload = vi.fn();
  renderHook(() =>
    useHeavyRoomsRetry({ failureReason: ConnectionFailureReason.HeavyRoomsFull, failureMessage: HEAVY_ROOMS_USER_CAP_MESSAGE, reload }),
  );
  vi.advanceTimersByTime(10 * HEAVY_ROOMS_RETRY_AFTER_MS);
  expect(reload).not.toHaveBeenCalled();
});

test.each([null, ConnectionFailureReason.AccessDenied, ConnectionFailureReason.SessionEnded])(
  'a failure of %s never reloads by itself',
  (failureReason) => {
    const reload = vi.fn();
    renderHook(() => useHeavyRoomsRetry({ failureReason, failureMessage: null, reload }));
    vi.advanceTimersByTime(10 * HEAVY_ROOMS_RETRY_AFTER_MS);
    expect(reload).not.toHaveBeenCalled();
  },
);

test('leaving the page or recovering cancels the pending reload', () => {
  const reload = vi.fn();
  const { rerender, unmount } = renderHook(({ failureReason }) => useHeavyRoomsRetry({ failureReason, failureMessage: null, reload }), {
    initialProps: { failureReason: ConnectionFailureReason.HeavyRoomsFull as ConnectionFailureReason | null },
  });
  rerender({ failureReason: null });
  vi.advanceTimersByTime(2 * HEAVY_ROOMS_RETRY_AFTER_MS);
  expect(reload).not.toHaveBeenCalled();
  rerender({ failureReason: ConnectionFailureReason.HeavyRoomsFull });
  unmount();
  vi.advanceTimersByTime(2 * HEAVY_ROOMS_RETRY_AFTER_MS);
  expect(reload).not.toHaveBeenCalled();
});

test('a page that renders again with a new reload function keeps the same pending reload and calls the newest function', () => {
  const first = vi.fn();
  const second = vi.fn();
  const { rerender } = renderHook(
    ({ reload }) =>
      useHeavyRoomsRetry({ failureReason: ConnectionFailureReason.HeavyRoomsFull, failureMessage: HEAVY_ROOMS_FULL_MESSAGE, reload }),
    {
      initialProps: { reload: first },
    },
  );
  vi.advanceTimersByTime(HEAVY_ROOMS_RETRY_AFTER_MS - 1);
  rerender({ reload: second });
  vi.advanceTimersByTime(1);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
});
