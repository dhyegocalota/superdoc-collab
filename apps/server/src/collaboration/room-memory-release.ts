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
  return function release(): void {
    throw new Error('createRoomMemoryRelease is not implemented');
  };
}
