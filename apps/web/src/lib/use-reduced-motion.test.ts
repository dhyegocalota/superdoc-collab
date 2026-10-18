import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { REDUCED_MOTION_QUERY, useReducedMotion } from './use-reduced-motion';

type MediaListener = () => void;

let prefersReducedMotion = false;
let mediaListeners: MediaListener[] = [];

function changePreference(next: boolean): void {
  prefersReducedMotion = next;
  act(() => mediaListeners.forEach((listener) => listener()));
}

beforeEach(() => {
  prefersReducedMotion = false;
  mediaListeners = [];
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === REDUCED_MOTION_QUERY && prefersReducedMotion;
    },
    media: query,
    addEventListener: (_type: string, listener: MediaListener) => mediaListeners.push(listener),
    removeEventListener: (_type: string, listener: MediaListener) => {
      mediaListeners = mediaListeners.filter((registered) => registered !== listener);
    },
  }));
});

afterEach(() => vi.unstubAllGlobals());

test('the hook reads the reduced motion preference', () => {
  prefersReducedMotion = true;
  const { result } = renderHook(useReducedMotion);
  expect(result.current).toBe(true);
});

test('the hook is false without the preference and follows a change', () => {
  const { result } = renderHook(useReducedMotion);
  expect(result.current).toBe(false);
  changePreference(true);
  expect(result.current).toBe(true);
  changePreference(false);
  expect(result.current).toBe(false);
});

test('unmounting removes the listener', () => {
  const { unmount } = renderHook(useReducedMotion);
  expect(mediaListeners).toHaveLength(1);
  unmount();
  expect(mediaListeners).toHaveLength(0);
});
