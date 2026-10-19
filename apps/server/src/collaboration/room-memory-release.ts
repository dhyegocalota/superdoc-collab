import { LARGE_ROOM_STATE_BYTES, MINUTE_MS } from '@superdoc-collab/types';
import { KeyedCooldown } from '../limits/keyed-cooldown';

export const ROOM_MEMORY_RELEASED_MESSAGE = 'Released the memory of a heavy room, resident bytes before and after and pause milliseconds:';
const RELEASE_COOLDOWN_MS = MINUTE_MS;
const RELEASE_COOLDOWN_KEY = 'process';

export type CollectGarbage = (options: { type: 'major'; execution: 'sync'; flavor: 'last-resort' }) => void;

export type RoomMemoryRelease = {
  observe: (room: { documentName: string; stateBytes: number }) => void;
  unloaded: (documentName: string) => void;
};

export function createRoomMemoryRelease({
  collectGarbage,
  memoryUsage,
  cooldownMs,
  now,
}: {
  collectGarbage: CollectGarbage | null;
  memoryUsage: () => NodeJS.MemoryUsage;
  cooldownMs: number;
  now: () => number;
}): RoomMemoryRelease {
  const heavyRooms = new Set<string>();
  const cooldown = new KeyedCooldown({ durationMs: cooldownMs, now });

  function collect(release: NonNullable<typeof collectGarbage>): void {
    const { rss: residentBefore } = memoryUsage();
    const startedAt = now();
    release({ type: 'major', execution: 'sync', flavor: 'last-resort' });
    const pauseMs = now() - startedAt;
    console.info(`${ROOM_MEMORY_RELEASED_MESSAGE} ${residentBefore} ${memoryUsage().rss} ${pauseMs}`);
  }

  return {
    observe({ documentName, stateBytes }) {
      if (stateBytes > LARGE_ROOM_STATE_BYTES) heavyRooms.add(documentName);
    },
    unloaded(documentName) {
      const wasHeavy = heavyRooms.delete(documentName);
      if (!wasHeavy || collectGarbage === null) return;
      if (cooldown.remainingMs(RELEASE_COOLDOWN_KEY) > 0) return;
      cooldown.start(RELEASE_COOLDOWN_KEY);
      setImmediate(() => collect(collectGarbage));
    },
  };
}

export function createProcessRoomMemoryRelease(): RoomMemoryRelease {
  const collectGarbage = typeof globalThis.gc === 'function' ? (globalThis.gc as CollectGarbage) : null;
  return createRoomMemoryRelease({
    collectGarbage,
    memoryUsage: () => process.memoryUsage(),
    cooldownMs: RELEASE_COOLDOWN_MS,
    now: () => Date.now(),
  });
}
