import {
  BYTES_PER_MEGABYTE,
  HEAVY_ROOM_HEAP_BYTES_PER_STATE_BYTE,
  LARGE_ROOM_STATE_BYTES,
  MINUTE_MS,
  SECOND_MS,
} from '@superdoc-collab/types';
import { KeyedCooldown } from '../limits/keyed-cooldown';

export const ROOM_MEMORY_RELEASE_DELAY_MS = SECOND_MS;
export const ROOM_RESERVATION_TTL_MS = 30 * SECOND_MS;
export const ROOM_MEMORY_RELEASED_MESSAGE = 'Released the memory of a heavy room, resident bytes before and after and pause milliseconds:';
const RELEASE_COOLDOWN_MS = MINUTE_MS;
const RELEASE_COOLDOWN_KEY = 'process';

export type CollectGarbage = (options: { type: 'major'; execution: 'sync'; flavor: 'regular' }) => void;

export type RoomMemoryRelease = {
  grew: (room: { documentName: string; bytes: number }) => void;
  unloaded: (room: { documentName: string; isReloaded: () => boolean }) => void;
  heavyHeapBytes: () => number;
  isBounded: () => boolean;
  admit: (room: { documentName: string; estimatedStateBytes: number }) => boolean;
  hasHeadroomFor: (estimatedStateBytes: number) => boolean;
};

export function createRoomMemoryRelease({
  collectGarbage,
  memoryUsage,
  cooldownMs,
  now,
  roomHeapBudgetBytes,
}: {
  collectGarbage: CollectGarbage | null;
  memoryUsage: () => NodeJS.MemoryUsage;
  cooldownMs: number;
  now: () => number;
  roomHeapBudgetBytes: number | null;
}): RoomMemoryRelease {
  const roomBytes = new Map<string, number>();
  const cooldown = new KeyedCooldown({ durationMs: cooldownMs, now });
  let isRetryPending = false;

  function isHeavy(bytes: number | undefined): boolean {
    return bytes !== undefined && bytes > LARGE_ROOM_STATE_BYTES;
  }

  function heavyHeapBytes(): never {
    throw new Error('heavyHeapBytes is not implemented');
  }

  function retryAfter({
    remainingMs,
    release,
    isReloaded,
  }: {
    remainingMs: number;
    release: NonNullable<typeof collectGarbage>;
    isReloaded: () => boolean;
  }): void {
    if (isRetryPending) return;
    isRetryPending = true;
    setTimeout(() => {
      isRetryPending = false;
      collect({ release, isReloaded });
    }, remainingMs).unref();
  }

  function collect({ release, isReloaded }: { release: NonNullable<typeof collectGarbage>; isReloaded: () => boolean }): void {
    if (isReloaded()) return;
    const remainingMs = cooldown.remainingMs(RELEASE_COOLDOWN_KEY);
    if (remainingMs > 0) return retryAfter({ remainingMs, release, isReloaded });
    cooldown.start(RELEASE_COOLDOWN_KEY);
    const { rss: residentBefore } = memoryUsage();
    const startedAt = now();
    release({ type: 'major', execution: 'sync', flavor: 'regular' });
    const pauseMs = now() - startedAt;
    console.info(`${ROOM_MEMORY_RELEASED_MESSAGE} ${residentBefore} ${memoryUsage().rss} ${pauseMs}`);
  }

  return {
    grew({ documentName, bytes }) {
      const known = roomBytes.get(documentName);
      roomBytes.set(documentName, known === undefined ? bytes : known + bytes);
    },
    unloaded({ documentName, isReloaded }) {
      const wasHeavy = isHeavy(roomBytes.get(documentName));
      roomBytes.delete(documentName);
      if (!wasHeavy || collectGarbage === null) return;
      setTimeout(() => collect({ release: collectGarbage, isReloaded }), ROOM_MEMORY_RELEASE_DELAY_MS).unref();
    },
    heavyHeapBytes,
    isBounded() {
      throw new Error(`isBounded is not implemented ${roomHeapBudgetBytes}`);
    },
    admit({ documentName, estimatedStateBytes }) {
      throw new Error(`admit is not implemented ${documentName} ${estimatedStateBytes} ${HEAVY_ROOM_HEAP_BYTES_PER_STATE_BYTE}`);
    },
    hasHeadroomFor(estimatedStateBytes) {
      throw new Error(`hasHeadroomFor is not implemented ${estimatedStateBytes}`);
    },
  };
}

export function createProcessRoomMemoryRelease({ roomHeapBudgetMegabytes }: { roomHeapBudgetMegabytes: number | null }): RoomMemoryRelease {
  const collectGarbage = typeof globalThis.gc === 'function' ? (globalThis.gc as CollectGarbage) : null;
  return createRoomMemoryRelease({
    collectGarbage,
    memoryUsage: () => process.memoryUsage(),
    cooldownMs: RELEASE_COOLDOWN_MS,
    now: () => Date.now(),
    roomHeapBudgetBytes: roomHeapBudgetMegabytes === null ? null : roomHeapBudgetMegabytes * BYTES_PER_MEGABYTE,
  });
}
