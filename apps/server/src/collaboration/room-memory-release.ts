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

type Reservation = { heapBytes: number; expiresAt: number };

export type CollectGarbage = (options: { type: 'major'; execution: 'sync'; flavor: 'regular' }) => void;

export type RoomMemoryRelease = {
  grew: (room: { documentName: string; bytes: number }) => void;
  unloaded: (room: { documentName: string; isReloaded: () => boolean }) => void;
  heavyHeapBytes: () => number;
  isBounded: () => boolean;
  loaded: (room: { documentName: string; bytes: number }) => void;
  isDueForMeasure: (documentName: string) => boolean;
  measured: (room: { documentName: string; bytes: number }) => void;
  admit: (room: { documentName: string; estimatedStateBytes: number; userId: string }) => boolean;
  hasHeadroomFor: (estimatedStateBytes: number) => boolean;
};

export function createRoomMemoryRelease({
  collectGarbage,
  memoryUsage,
  cooldownMs,
  now,
  roomHeapBudgetBytes,
  closeRoom,
}: {
  collectGarbage: CollectGarbage | null;
  memoryUsage: () => NodeJS.MemoryUsage;
  cooldownMs: number;
  now: () => number;
  roomHeapBudgetBytes: number | null;
  closeRoom: (documentName: string) => void;
}): RoomMemoryRelease {
  const roomBytes = new Map<string, number>();
  const reservations = new Map<string, Reservation>();
  const cooldown = new KeyedCooldown({ durationMs: cooldownMs, now });
  let isRetryPending = false;

  function isHeavy(bytes: number | undefined): boolean {
    return bytes !== undefined && bytes > LARGE_ROOM_STATE_BYTES;
  }

  function heapBytesOf(stateBytes: number): number {
    return stateBytes * HEAVY_ROOM_HEAP_BYTES_PER_STATE_BYTE;
  }

  function liveReservations(): Map<string, Reservation> {
    [...reservations.entries()]
      .filter(([, { expiresAt }]) => expiresAt <= now())
      .forEach(([documentName]) => reservations.delete(documentName));
    return reservations;
  }

  function heavyHeapBytes(): number {
    const loaded = [...roomBytes.values()].filter(isHeavy).reduce((sum, bytes) => sum + heapBytesOf(bytes), 0);
    const reserved = [...liveReservations().values()].reduce((sum, { heapBytes }) => sum + heapBytes, 0);
    return loaded + reserved;
  }

  function hasHeadroomFor(estimatedStateBytes: number): boolean {
    if (roomHeapBudgetBytes === null) return true;
    return heavyHeapBytes() + heapBytesOf(estimatedStateBytes) <= roomHeapBudgetBytes;
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
      reservations.delete(documentName);
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
    loaded({ documentName, bytes }) {
      throw new Error(`loaded is not implemented ${documentName} ${bytes} ${typeof closeRoom}`);
    },
    isDueForMeasure(documentName) {
      throw new Error(`isDueForMeasure is not implemented ${documentName}`);
    },
    measured({ documentName, bytes }) {
      throw new Error(`measured is not implemented ${documentName} ${bytes}`);
    },
    isBounded: () => roomHeapBudgetBytes !== null,
    admit({ documentName, estimatedStateBytes }) {
      if (roomHeapBudgetBytes === null) return true;
      if (isHeavy(roomBytes.get(documentName))) return true;
      if (liveReservations().has(documentName)) return true;
      if (!hasHeadroomFor(estimatedStateBytes)) return false;
      reservations.set(documentName, { heapBytes: heapBytesOf(estimatedStateBytes), expiresAt: now() + ROOM_RESERVATION_TTL_MS });
      return true;
    },
    hasHeadroomFor,
  };
}

export function createProcessRoomMemoryRelease({
  roomHeapBudgetMegabytes,
  closeRoom,
}: {
  roomHeapBudgetMegabytes: number | null;
  closeRoom: (documentName: string) => void;
}): RoomMemoryRelease {
  const collectGarbage = typeof globalThis.gc === 'function' ? (globalThis.gc as CollectGarbage) : null;
  return createRoomMemoryRelease({
    collectGarbage,
    memoryUsage: () => process.memoryUsage(),
    cooldownMs: RELEASE_COOLDOWN_MS,
    now: () => Date.now(),
    closeRoom,
    roomHeapBudgetBytes: roomHeapBudgetMegabytes === null ? null : roomHeapBudgetMegabytes * BYTES_PER_MEGABYTE,
  });
}
