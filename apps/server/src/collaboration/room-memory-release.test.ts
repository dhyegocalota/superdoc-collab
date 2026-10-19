import { LARGE_DOCUMENT_HEAP_BYTES } from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { createRoomMemoryRelease, ROOM_MEMORY_RELEASED_MESSAGE } from './room-memory-release';

const RESIDENT_BEFORE_BYTES = 3_000_000_000;
const RESIDENT_AFTER_BYTES = 900_000_000;

function memoryUsageOf({ heapUsed, residents }: { heapUsed: number; residents: number[] }): () => NodeJS.MemoryUsage {
  const remaining = [...residents];
  return () => ({ rss: remaining.shift() ?? 0, heapUsed, heapTotal: heapUsed, external: 0, arrayBuffers: 0 });
}

test('a heavy heap at unload runs a major, synchronous, reducing collection and logs the resident memory around it', () => {
  const collectGarbage = vi.fn();
  const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const release = createRoomMemoryRelease({
    collectGarbage,
    memoryUsage: memoryUsageOf({ heapUsed: LARGE_DOCUMENT_HEAP_BYTES + 1, residents: [RESIDENT_BEFORE_BYTES, RESIDENT_AFTER_BYTES] }),
  });
  release();
  expect(collectGarbage).toHaveBeenCalledExactlyOnceWith({ type: 'major', execution: 'sync', flavor: 'last-resort' });
  expect(consoleInfo).toHaveBeenCalledWith(`${ROOM_MEMORY_RELEASED_MESSAGE} ${RESIDENT_BEFORE_BYTES} ${RESIDENT_AFTER_BYTES}`);
  consoleInfo.mockRestore();
});

test('a light heap at unload collects nothing', () => {
  const collectGarbage = vi.fn();
  const release = createRoomMemoryRelease({
    collectGarbage,
    memoryUsage: memoryUsageOf({ heapUsed: LARGE_DOCUMENT_HEAP_BYTES, residents: [] }),
  });
  release();
  expect(collectGarbage).not.toHaveBeenCalled();
});

test('without an exposed collector nothing runs and nothing is logged', () => {
  const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const release = createRoomMemoryRelease({
    collectGarbage: null,
    memoryUsage: memoryUsageOf({ heapUsed: LARGE_DOCUMENT_HEAP_BYTES + 1, residents: [] }),
  });
  release();
  expect(consoleInfo).not.toHaveBeenCalled();
  consoleInfo.mockRestore();
});
