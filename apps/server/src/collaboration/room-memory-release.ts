import { LARGE_ROOM_STATE_BYTES } from '@superdoc-collab/types';

export const ROOM_MEMORY_RELEASED_MESSAGE = 'Released the memory of a heavy room, resident bytes before and after and pause milliseconds:';

export type CollectGarbage = (options: { type: 'major'; execution: 'sync'; flavor: 'regular' }) => void;

export type RoomMemoryRelease = {
  observe: (room: { documentName: string; stateBytes: number }) => void;
  unloaded: (documentName: string) => void;
};

export function createRoomMemoryRelease(parameters: {
  collectGarbage: CollectGarbage | null;
  memoryUsage: () => NodeJS.MemoryUsage;
  cooldownMs: number;
  now: () => number;
}): RoomMemoryRelease {
  void parameters;
  void LARGE_ROOM_STATE_BYTES;
  throw new Error('createRoomMemoryRelease is not implemented');
}

export function createProcessRoomMemoryRelease(): RoomMemoryRelease {
  throw new Error('createProcessRoomMemoryRelease is not implemented');
}
