import { LARGE_DOCUMENT_HEAP_BYTES } from '@superdoc-collab/types';

export function createRetainedHeapReader({
  memoryUsage,
  collectGarbage,
}: {
  memoryUsage: () => NodeJS.MemoryUsage;
  collectGarbage: () => void;
}): () => number {
  return function read(): number {
    if (memoryUsage().heapTotal <= LARGE_DOCUMENT_HEAP_BYTES) return memoryUsage().heapUsed;
    collectGarbage();
    return memoryUsage().heapUsed;
  };
}
