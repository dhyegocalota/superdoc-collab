import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useMediaQuery } from './use-media-query';

const QUERY = '(min-width: 500px)';

type MediaListener = () => void;

let isMatching = false;
let mediaListeners: MediaListener[] = [];

beforeEach(() => {
  isMatching = false;
  mediaListeners = [];
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === QUERY && isMatching;
    },
    media: query,
    addEventListener: (_type: string, listener: MediaListener) => mediaListeners.push(listener),
    removeEventListener: (_type: string, listener: MediaListener) => {
      mediaListeners = mediaListeners.filter((registered) => registered !== listener);
    },
  }));
});

afterEach(() => vi.unstubAllGlobals());

test('the hook follows the query and drops its listener on unmount', () => {
  const { result, unmount } = renderHook(() => useMediaQuery(QUERY));
  expect(result.current).toBe(false);
  isMatching = true;
  act(() => mediaListeners.forEach((listener) => listener()));
  expect(result.current).toBe(true);
  unmount();
  expect(mediaListeners).toHaveLength(0);
});
