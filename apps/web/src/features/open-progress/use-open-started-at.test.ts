import { SECOND_MS } from '@superdoc-collab/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useOpenStartedAt } from './use-open-started-at';

const STARTED_AT = new Date('2026-10-19T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ now: STARTED_AT });
});

afterEach(() => {
  vi.useRealTimers();
});

test('it is the moment the page opened and stays while the document stays', () => {
  const { result, rerender } = renderHook(({ documentId }) => useOpenStartedAt(documentId), { initialProps: { documentId: 'doc-1' } });
  expect(result.current).toBe(STARTED_AT.getTime());
  act(() => vi.advanceTimersByTime(5 * SECOND_MS));
  rerender({ documentId: 'doc-1' });
  expect(result.current).toBe(STARTED_AT.getTime());
});

test('another document starts its own clock', () => {
  const { result, rerender } = renderHook(({ documentId }) => useOpenStartedAt(documentId), { initialProps: { documentId: 'doc-1' } });
  act(() => vi.advanceTimersByTime(5 * SECOND_MS));
  rerender({ documentId: 'doc-2' });
  expect(result.current).toBe(STARTED_AT.getTime() + 5 * SECOND_MS);
});
