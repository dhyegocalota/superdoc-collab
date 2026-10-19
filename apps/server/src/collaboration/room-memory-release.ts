import { LARGE_ROOM_STATE_BYTES, MINUTE_MS, SECOND_MS } from '@superdoc-collab/types';
import { KeyedCooldown } from '../limits/keyed-cooldown';

export const ROOM_MEMORY_RELEASE_DELAY_MS = SECOND_MS;
export const ROOM_MEMORY_RELEASED_MESSAGE = 'Released the memory of a heavy room, resident bytes before and after and pause milliseconds:';
const RELEASE_COOLDOWN_MS = MINUTE_MS;
const RELEASE_COOLDOWN_KEY = 'process';

export type CollectGarbage = (options: { type: 'major'; execution: 'sync'; flavor: 'regular' }) => void;

export type RoomMemoryRelease = {
  observe: (room: { documentName: string; stateBytes: number }) => void;
  unloaded: (room: { documentName: string; isReloaded: () => boolean }) => void;
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

  function collect({ release, isReloaded }: { release: NonNullable<typeof collectGarbage>; isReloaded: () => boolean }): void {
    if (isReloaded()) return;
    if (cooldown.remainingMs(RELEASE_COOLDOWN_KEY) > 0) return;
    cooldown.start(RELEASE_COOLDOWN_KEY);
    const { rss: residentBefore } = memoryUsage();
    const startedAt = now();
    release({ type: 'major', execution: 'sync', flavor: 'regular' });
    const pauseMs = now() - startedAt;
    console.info(`${ROOM_MEMORY_RELEASED_MESSAGE} ${residentBefore} ${memoryUsage().rss} ${pauseMs}`);
  }

  return {
    observe({ documentName, stateBytes }) {
      if (stateBytes > LARGE_ROOM_STATE_BYTES) heavyRooms.add(documentName);
    },
    unloaded({ documentName, isReloaded }) {
      const wasHeavy = heavyRooms.delete(documentName);
      if (!wasHeavy || collectGarbage === null) return;
      setTimeout(() => collect({ release: collectGarbage, isReloaded }), ROOM_MEMORY_RELEASE_DELAY_MS).unref();
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
