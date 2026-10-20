import {
  HEAVY_ROOM_HEAP_BYTES_PER_STATE_BYTE,
  LARGE_ROOM_STATE_BYTES,
  MAX_HEAVY_ROOMS_PER_USER,
  BOOTSTRAP_HOST_TIMEOUT_MS,
  BYTES_PER_MEGABYTE,
  MAX_BOOTSTRAP_WAIT_MS,
  MINUTE_MS,
  SECOND_MS,
  SMALL_ROOMS_HEAP_SHARE,
} from '@superdoc-collab/types';
import { KeyedCooldown } from '../limits/keyed-cooldown';

export const ROOM_MEMORY_RELEASE_DELAY_MS = SECOND_MS;
export const ROOM_RESERVATION_TTL_MS = 30 * SECOND_MS;
export const ROOM_REMEASURE_COOLDOWN_MS = 30 * SECOND_MS;
export const ROOM_UPLOAD_RESERVATION_TTL_MS = MAX_BOOTSTRAP_WAIT_MS + BOOTSTRAP_HOST_TIMEOUT_MS;
export const ROOM_MEMORY_RELEASED_MESSAGE = 'Released the memory of a heavy room, resident bytes before and after and pause milliseconds:';
const RELEASE_COOLDOWN_MS = MINUTE_MS;
const RELEASE_COOLDOWN_KEY = 'process';

type Reservation = { heapBytes: number; expiresAt: number; uploadedBy: string | null };
type RoomPlace = { documentName: string; estimatedStateBytes: number; userId: string };

export type CollectGarbage = (options: { type: 'major'; execution: 'sync'; flavor: 'regular' }) => void;

export type RoomMemoryRelease = {
  grew: (room: { documentName: string; bytes: number }) => void;
  loaded: (room: { documentName: string; bytes: number }) => void;
  unloaded: (room: { documentName: string; isReloaded: () => boolean }) => void;
  released: (socket: { documentName: string; userId: string }) => void;
  roomsHeapBytes: () => number;
  isBounded: () => boolean;
  holdsMaximum: (userId: string) => boolean;
  fits: (room: RoomPlace) => boolean;
  admit: (room: RoomPlace) => boolean;
  reserveForUpload: (room: RoomPlace) => boolean;
  unreserved: (documentName: string) => void;
  hasHeadroomFor: (estimatedStateBytes: number) => boolean;
};

export function createRoomMemoryRelease({
  collectGarbage,
  memoryUsage,
  cooldownMs,
  now,
  roomHeapBudgetBytes,
  measureRoom,
}: {
  collectGarbage: CollectGarbage | null;
  memoryUsage: () => NodeJS.MemoryUsage;
  cooldownMs: number;
  now: () => number;
  roomHeapBudgetBytes: number | null;
  measureRoom: (documentName: string) => number | null;
}): RoomMemoryRelease {
  const roomBytes = new Map<string, number>();
  const reservations = new Map<string, Reservation>();
  const holders = new Map<string, Map<string, number>>();
  const receivedSinceMeasure = new Map<string, number>();
  const cooldown = new KeyedCooldown({ durationMs: cooldownMs, now });
  const remeasureCooldown = new KeyedCooldown({ durationMs: ROOM_REMEASURE_COOLDOWN_MS, now });
  let isRetryPending = false;

  function isHeavy(bytes: number): boolean {
    return bytes > LARGE_ROOM_STATE_BYTES;
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

  function reservedHeapBytes(): number {
    return [...liveReservations().values()].reduce((sum, { heapBytes }) => sum + heapBytes, 0);
  }

  function roomsHeapBytes(): number {
    const loaded = [...roomBytes.values()].reduce((sum, bytes) => sum + heapBytesOf(bytes), 0);
    return loaded + reservedHeapBytes();
  }

  function heavyHeapBytes(): number {
    const loaded = [...roomBytes.values()].filter(isHeavy).reduce((sum, bytes) => sum + heapBytesOf(bytes), 0);
    return loaded + reservedHeapBytes();
  }

  function isShortOf({ budgetBytes, estimatedStateBytes }: { budgetBytes: number; estimatedStateBytes: number }): boolean {
    const estimatedHeapBytes = heapBytesOf(estimatedStateBytes);
    const heavyShareBytes = budgetBytes * (1 - SMALL_ROOMS_HEAP_SHARE);
    return roomsHeapBytes() + estimatedHeapBytes > budgetBytes || heavyHeapBytes() + estimatedHeapBytes > heavyShareBytes;
  }

  function remeasureRoomsWithUpdates(): void {
    const edited = [...receivedSinceMeasure.entries()].filter(([, received]) => received > 0);
    if (edited.length === 0 || remeasureCooldown.remainingMs(RELEASE_COOLDOWN_KEY) > 0) return;
    remeasureCooldown.start(RELEASE_COOLDOWN_KEY);
    edited.forEach(([documentName]) => {
      const bytes = measureRoom(documentName);
      if (bytes === null) return;
      roomBytes.set(documentName, bytes);
      receivedSinceMeasure.set(documentName, 0);
    });
  }

  function hasHeadroomFor(estimatedStateBytes: number): boolean {
    if (roomHeapBudgetBytes === null) return true;
    if (!isShortOf({ budgetBytes: roomHeapBudgetBytes, estimatedStateBytes })) return true;
    remeasureRoomsWithUpdates();
    return !isShortOf({ budgetBytes: roomHeapBudgetBytes, estimatedStateBytes });
  }

  function isHeld(documentName: string): boolean {
    const bytes = roomBytes.get(documentName);
    return (bytes !== undefined && isHeavy(bytes)) || liveReservations().has(documentName);
  }

  function addHolder({ documentName, userId }: { documentName: string; userId: string }): void {
    const sockets = holders.get(documentName);
    const known = sockets === undefined ? undefined : sockets.get(userId);
    holders.set(documentName, new Map([...(sockets === undefined ? [] : sockets), [userId, known === undefined ? 1 : known + 1]]));
  }

  function heldRoomCount(userId: string): number {
    return [...holders.entries()].filter(([documentName, sockets]) => sockets.has(userId) && isHeld(documentName)).length;
  }

  function reserve({
    documentName,
    estimatedStateBytes,
    userId,
    ttlMs,
    uploadedBy,
  }: RoomPlace & { ttlMs: number; uploadedBy: string | null }): boolean {
    if (roomHeapBudgetBytes === null) return true;
    if (isHeld(documentName)) {
      addHolder({ documentName, userId });
      return true;
    }
    if (!fits({ documentName, estimatedStateBytes, userId })) return false;
    addHolder({ documentName, userId });
    reservations.set(documentName, { heapBytes: heapBytesOf(estimatedStateBytes), expiresAt: now() + ttlMs, uploadedBy });
    return true;
  }

  function fits({ documentName, estimatedStateBytes, userId }: RoomPlace): boolean {
    if (roomHeapBudgetBytes === null) return true;
    if (isHeld(documentName)) return true;
    if (heldRoomCount(userId) >= MAX_HEAVY_ROOMS_PER_USER) return false;
    return hasHeadroomFor(estimatedStateBytes);
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
    },
    loaded({ documentName, bytes }) {
      reservations.delete(documentName);
      roomBytes.set(documentName, bytes);
      receivedSinceMeasure.set(documentName, 0);
    },
    unloaded({ documentName, isReloaded }) {
      const bytes = roomBytes.get(documentName);
      const wasHeavy = bytes !== undefined && isHeavy(bytes);
      [roomBytes, reservations, holders, receivedSinceMeasure].forEach((tracked) => tracked.delete(documentName));
      if (!wasHeavy || collectGarbage === null) return;
      setTimeout(() => collect({ release: collectGarbage, isReloaded }), ROOM_MEMORY_RELEASE_DELAY_MS).unref();
    },
    released({ documentName, userId }) {
      const sockets = holders.get(documentName);
      const known = sockets === undefined ? undefined : sockets.get(userId);
      if (sockets === undefined || known === undefined) return;
      const remaining = new Map(sockets);
      if (known > 1) remaining.set(userId, known - 1);
      if (known <= 1) remaining.delete(userId);
      if (remaining.size > 0) return void holders.set(documentName, remaining);
      holders.delete(documentName);
      if (!roomBytes.has(documentName)) reservations.delete(documentName);
    },
    roomsHeapBytes,
    isBounded: () => roomHeapBudgetBytes !== null,
    holdsMaximum: (userId) => heldRoomCount(userId) >= MAX_HEAVY_ROOMS_PER_USER,
    fits,
    admit: (room) => reserve({ ...room, ttlMs: ROOM_RESERVATION_TTL_MS, uploadedBy: null }),
    reserveForUpload(room) {
      const hasUploadReservation = [...liveReservations().values()].some(({ uploadedBy }) => uploadedBy === room.userId);
      if (roomHeapBudgetBytes !== null && hasUploadReservation && !isHeld(room.documentName)) return false;
      return reserve({ ...room, ttlMs: ROOM_UPLOAD_RESERVATION_TTL_MS, uploadedBy: room.userId });
    },
    unreserved(documentName) {
      if (roomBytes.has(documentName)) return;
      reservations.delete(documentName);
      holders.delete(documentName);
    },
    hasHeadroomFor,
  };
}

export function createProcessRoomMemoryRelease({
  roomHeapBudgetMegabytes,
  measureRoom,
}: {
  roomHeapBudgetMegabytes: number | null;
  measureRoom: (documentName: string) => number | null;
}): RoomMemoryRelease {
  const collectGarbage = typeof globalThis.gc === 'function' ? (globalThis.gc as CollectGarbage) : null;
  return createRoomMemoryRelease({
    collectGarbage,
    memoryUsage: () => process.memoryUsage(),
    cooldownMs: RELEASE_COOLDOWN_MS,
    now: () => Date.now(),
    roomHeapBudgetBytes: roomHeapBudgetMegabytes === null ? null : roomHeapBudgetMegabytes * BYTES_PER_MEGABYTE,
    measureRoom,
  });
}
