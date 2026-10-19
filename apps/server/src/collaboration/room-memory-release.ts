import { LARGE_DOCUMENT_HEAP_BYTES } from '@superdoc-collab/types';

export const ROOM_MEMORY_RELEASED_MESSAGE = 'Released the memory of a heavy room, resident bytes before and after:';

export type CollectGarbage = (options: { type: 'major'; execution: 'sync'; flavor: 'last-resort' }) => void;

export function createRoomMemoryRelease({
  collectGarbage,
  memoryUsage,
}: {
  collectGarbage: CollectGarbage | null;
  memoryUsage: () => NodeJS.MemoryUsage;
}): () => void {
  function collect(): void {
    if (collectGarbage === null) return;
    const { heapUsed, rss: residentBefore } = memoryUsage();
    if (heapUsed <= LARGE_DOCUMENT_HEAP_BYTES) return;
    collectGarbage({ type: 'major', execution: 'sync', flavor: 'last-resort' });
    console.info(`${ROOM_MEMORY_RELEASED_MESSAGE} ${residentBefore} ${memoryUsage().rss}`);
  }

  return function release(): void {
    setImmediate(collect);
  };
}

export function createProcessRoomMemoryRelease(): () => void {
  const collectGarbage = typeof globalThis.gc === 'function' ? (globalThis.gc as CollectGarbage) : null;
  return createRoomMemoryRelease({ collectGarbage, memoryUsage: () => process.memoryUsage() });
}
