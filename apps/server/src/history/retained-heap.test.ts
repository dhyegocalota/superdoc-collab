import { LARGE_DOCUMENT_HEAP_BYTES } from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { createRetainedHeapReader } from './retained-heap';

const GARBAGE_HEAP_BYTES = 900_000_000;
const RETAINED_HEAP_BYTES = 120_000_000;
const SMALL_HEAP_BYTES = 90_000_000;

function usage({ heapTotal, heapUsed }: { heapTotal: number; heapUsed: number }): NodeJS.MemoryUsage {
  return { rss: 0, heapTotal, heapUsed, external: 0, arrayBuffers: 0 };
}

test('a heap total above the large document size is collected before its used bytes are read', () => {
  let isCollected = false;
  const collectGarbage = vi.fn(() => {
    isCollected = true;
  });
  const read = createRetainedHeapReader({
    memoryUsage: () =>
      isCollected
        ? usage({ heapTotal: LARGE_DOCUMENT_HEAP_BYTES + 1, heapUsed: RETAINED_HEAP_BYTES })
        : usage({ heapTotal: LARGE_DOCUMENT_HEAP_BYTES + 1, heapUsed: GARBAGE_HEAP_BYTES }),
    collectGarbage,
  });
  expect(read()).toBe(RETAINED_HEAP_BYTES);
  expect(collectGarbage).toHaveBeenCalledOnce();
});

test('a heap total at the large document size is read without a collection', () => {
  const collectGarbage = vi.fn();
  const read = createRetainedHeapReader({
    memoryUsage: () => usage({ heapTotal: LARGE_DOCUMENT_HEAP_BYTES, heapUsed: SMALL_HEAP_BYTES }),
    collectGarbage,
  });
  expect(read()).toBe(SMALL_HEAP_BYTES);
  expect(collectGarbage).not.toHaveBeenCalled();
});
