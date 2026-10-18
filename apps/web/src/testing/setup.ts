import '@testing-library/jest-dom/vitest';
import { SECOND_MS } from '@superdoc-collab/types';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

const TEST_ELEMENT_WIDTH = 600;
const ASYNC_UTIL_TIMEOUT_MS = 5 * SECOND_MS;

configure({ asyncUtilTimeout: ASYNC_UTIL_TIMEOUT_MS });

class ResizeObserverDouble {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element): void {
    this.callback([{ target, contentRect: { width: TEST_ELEMENT_WIDTH } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }

  unobserve(): void {}

  disconnect(): void {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverDouble);

function matchMediaDouble(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  };
}

vi.stubGlobal('matchMedia', matchMediaDouble);

afterEach(cleanup);
