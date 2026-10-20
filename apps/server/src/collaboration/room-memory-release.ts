import {
  BYTES_PER_MEGABYTE,
  HEAVY_ROOM_HEAP_BYTES_PER_STATE_BYTE,
  HEAVY_ROOM_IDLE_MS,
  LARGE_ROOM_STATE_BYTES,
  MAX_HEAVY_ROOMS_PER_USER,
  MINUTE_MS,
  SECOND_MS,
} from '@superdoc-collab/types';
import { KeyedCooldown } from '../limits/keyed-cooldown';

export const ROOM_MEMORY_RELEASE_DELAY_MS = SECOND_MS;
export const ROOM_RESERVATION_TTL_MS = 30 * SECOND_MS;
export const ROOM_REMEASURE_BYTES = 4 * BYTES_PER_MEGABYTE;
export const IDLE_ROOM_CLOSED_MESSAGE = 'Closed the sockets of a heavy room nobody edited, to make room for another, for';
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
  touched: (documentName: string) => void;
  released: (documentName: string) => void;
  fits: (room: { documentName: string; estimatedStateBytes: number; userId: string }) => boolean;
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
  const holders = new Map<string, Set<string>>();
  const lastActivityAt = new Map<string, number>();
  const receivedSinceMeasure = new Map<string, number>();
  const closing = new Set<string>();
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

  function addHolder({ documentName, userId }: { documentName: string; userId: string }): void {
    const current = holders.get(documentName);
    holders.set(documentName, new Set([...(current === undefined ? [] : current), userId]));
  }

  function heldRoomCount(userId: string): number {
    const reserved = liveReservations();
    return [...holders.entries()].filter(
      ([documentName, users]) => users.has(userId) && (isHeavy(roomBytes.get(documentName)) || reserved.has(documentName)),
    ).length;
  }

  function touch(documentName: string): void {
    lastActivityAt.set(documentName, now());
  }

  function isIdle(documentName: string): boolean {
    const lastAt = lastActivityAt.get(documentName);
    return lastAt === undefined || now() - lastAt >= HEAVY_ROOM_IDLE_MS;
  }

  function lastActivityOf(documentName: string): number {
    const lastAt = lastActivityAt.get(documentName);
    return lastAt === undefined ? 0 : lastAt;
  }

  function closeLeastActiveIdleRoom(except: string): void {
    const [leastActive] = [...roomBytes.entries()]
      .filter(([documentName, bytes]) => documentName !== except && isHeavy(bytes) && !closing.has(documentName) && isIdle(documentName))
      .map(([documentName]) => documentName)
      .sort((first, second) => lastActivityOf(first) - lastActivityOf(second));
    if (leastActive === undefined) return;
    closing.add(leastActive);
    console.info(`${IDLE_ROOM_CLOSED_MESSAGE} ${leastActive}`);
    closeRoom(leastActive);
  }

  function isHeld(documentName: string): boolean {
    return isHeavy(roomBytes.get(documentName)) || liveReservations().has(documentName);
  }

  function fits({
    documentName,
    estimatedStateBytes,
    userId,
  }: {
    documentName: string;
    estimatedStateBytes: number;
    userId: string;
  }): boolean {
    if (roomHeapBudgetBytes === null) return true;
    if (isHeld(documentName)) return true;
    if (heldRoomCount(userId) >= MAX_HEAVY_ROOMS_PER_USER) return false;
    return hasHeadroomFor(estimatedStateBytes);
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
      const received = receivedSinceMeasure.get(documentName);
      roomBytes.set(documentName, known === undefined ? bytes : known + bytes);
      receivedSinceMeasure.set(documentName, received === undefined ? bytes : received + bytes);
      touch(documentName);
    },
    unloaded({ documentName, isReloaded }) {
      const wasHeavy = isHeavy(roomBytes.get(documentName));
      [roomBytes, reservations, holders, lastActivityAt, receivedSinceMeasure, closing].forEach((tracked) => tracked.delete(documentName));
      if (!wasHeavy || collectGarbage === null) return;
      setTimeout(() => collect({ release: collectGarbage, isReloaded }), ROOM_MEMORY_RELEASE_DELAY_MS).unref();
    },
    heavyHeapBytes,
    loaded({ documentName, bytes }) {
      reservations.delete(documentName);
      roomBytes.set(documentName, bytes);
      receivedSinceMeasure.set(documentName, 0);
      touch(documentName);
    },
    isDueForMeasure(documentName) {
      const received = receivedSinceMeasure.get(documentName);
      return received !== undefined && received > ROOM_REMEASURE_BYTES;
    },
    measured({ documentName, bytes }) {
      roomBytes.set(documentName, bytes);
      receivedSinceMeasure.set(documentName, 0);
      touch(documentName);
    },
    touched(documentName) {
      if (roomBytes.has(documentName)) touch(documentName);
    },
    released(documentName) {
      if (isHeavy(roomBytes.get(documentName))) return;
      reservations.delete(documentName);
      holders.delete(documentName);
    },
    fits,
    isBounded: () => roomHeapBudgetBytes !== null,
    admit({ documentName, estimatedStateBytes, userId }) {
      if (roomHeapBudgetBytes === null) return true;
      if (isHeld(documentName)) {
        addHolder({ documentName, userId });
        return true;
      }
      if (heldRoomCount(userId) >= MAX_HEAVY_ROOMS_PER_USER) return false;
      if (!hasHeadroomFor(estimatedStateBytes)) {
        closeLeastActiveIdleRoom(documentName);
        return false;
      }
      addHolder({ documentName, userId });
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
