import {
  HEAVY_ROOM_HEAP_BYTES_PER_STATE_BYTE,
  HEAVY_ROOM_IDLE_MS,
  LARGE_ROOM_STATE_BYTES,
  MAX_HEAVY_ROOMS_PER_USER,
} from '@superdoc-collab/types';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  createRoomMemoryRelease,
  ROOM_MEMORY_RELEASE_DELAY_MS,
  ROOM_MEMORY_RELEASED_MESSAGE,
  ROOM_RESERVATION_TTL_MS,
} from './room-memory-release';

const RESIDENT_BEFORE_BYTES = 3_000_000_000;
const RESIDENT_AFTER_BYTES = 900_000_000;
const HEAVY_ROOM = 'heavy-room';
const OTHER_HEAVY_ROOM = 'other-heavy-room';
const THIRD_HEAVY_ROOM = 'third-heavy-room';
const SMALL_ROOM = 'small-room';
const COOLDOWN_MS = 60_000;
const PAUSE_MS = 120;

class ExhaustedMemoryReadingsError extends Error {}

function residentReadings(readings: number[]): () => NodeJS.MemoryUsage {
  const remaining = [...readings];
  return () => {
    const rss = remaining.shift();
    if (rss === undefined) throw new ExhaustedMemoryReadingsError();
    return { rss, heapUsed: 0, heapTotal: 0, external: 0, arrayBuffers: 0 };
  };
}

async function afterReleaseDelay(): Promise<void> {
  await vi.advanceTimersByTimeAsync(ROOM_MEMORY_RELEASE_DELAY_MS);
}

const ANA = 'user-ana';
const BRUNO = 'user-bruno';

function releaseWith({
  readings,
  clock = () => 0,
  roomHeapBudgetBytes = null,
  closeRoom = vi.fn(),
}: {
  readings: number[];
  clock?: () => number;
  roomHeapBudgetBytes?: number | null;
  closeRoom?: (documentName: string) => void;
}) {
  const collectGarbage = vi.fn();
  const release = createRoomMemoryRelease({
    collectGarbage,
    memoryUsage: residentReadings(readings),
    cooldownMs: COOLDOWN_MS,
    now: clock,
    roomHeapBudgetBytes,
    closeRoom,
  });
  return { collectGarbage, release };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test('a heavy room that unloads gets one regular, synchronous collection once the delay has passed, logged with the pause', async () => {
  const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const times = [0, 0, PAUSE_MS];
  const { collectGarbage, release } = releaseWith({
    readings: [RESIDENT_BEFORE_BYTES, RESIDENT_AFTER_BYTES],
    clock: () => times.shift() as number,
  });
  release.grew({ documentName: HEAVY_ROOM, bytes: LARGE_ROOM_STATE_BYTES + 1 });
  release.unloaded({ documentName: HEAVY_ROOM, isReloaded: () => false });
  await vi.advanceTimersByTimeAsync(ROOM_MEMORY_RELEASE_DELAY_MS - 1);
  expect(collectGarbage).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(collectGarbage).toHaveBeenCalledExactlyOnceWith({ type: 'major', execution: 'sync', flavor: 'regular' });
  expect(consoleInfo).toHaveBeenCalledWith(`${ROOM_MEMORY_RELEASED_MESSAGE} ${RESIDENT_BEFORE_BYTES} ${RESIDENT_AFTER_BYTES} ${PAUSE_MS}`);
  consoleInfo.mockRestore();
});

test('a small room that unloads while a heavy one is open collects nothing', async () => {
  const { collectGarbage, release } = releaseWith({ readings: [] });
  release.grew({ documentName: SMALL_ROOM, bytes: LARGE_ROOM_STATE_BYTES });
  release.unloaded({ documentName: SMALL_ROOM, isReloaded: () => false });
  await afterReleaseDelay();
  expect(collectGarbage).not.toHaveBeenCalled();
});

test('heavy unloads inside the cooldown collect once more when it ends and not before', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const { collectGarbage, release } = releaseWith({ readings: [1, 2, 3, 4], clock: () => Date.now() });
  [HEAVY_ROOM, OTHER_HEAVY_ROOM, THIRD_HEAVY_ROOM].forEach((documentName) => {
    release.grew({ documentName, bytes: LARGE_ROOM_STATE_BYTES + 1 });
    release.unloaded({ documentName, isReloaded: () => false });
  });
  await afterReleaseDelay();
  expect(collectGarbage).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(COOLDOWN_MS - 1);
  expect(collectGarbage).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(collectGarbage).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(COOLDOWN_MS);
  expect(collectGarbage).toHaveBeenCalledTimes(2);
});

test('a room unloaded twice is collected for once', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const { collectGarbage, release } = releaseWith({ readings: [1, 2] });
  release.grew({ documentName: HEAVY_ROOM, bytes: LARGE_ROOM_STATE_BYTES + 1 });
  release.unloaded({ documentName: HEAVY_ROOM, isReloaded: () => false });
  release.unloaded({ documentName: HEAVY_ROOM, isReloaded: () => false });
  await afterReleaseDelay();
  expect(collectGarbage).toHaveBeenCalledOnce();
});

test('without an exposed collector nothing runs and nothing is logged', async () => {
  const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const release = createRoomMemoryRelease({
    collectGarbage: null,
    memoryUsage: residentReadings([]),
    cooldownMs: COOLDOWN_MS,
    now: () => 0,
    roomHeapBudgetBytes: null,
    closeRoom: vi.fn(),
  });
  release.grew({ documentName: HEAVY_ROOM, bytes: LARGE_ROOM_STATE_BYTES + 1 });
  release.unloaded({ documentName: HEAVY_ROOM, isReloaded: () => false });
  await afterReleaseDelay();
  expect(consoleInfo).not.toHaveBeenCalled();
  consoleInfo.mockRestore();
});

test('a room that is loaded again when the delay ends collects nothing and leaves the cooldown unspent', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const { collectGarbage, release } = releaseWith({ readings: [1, 2] });
  release.grew({ documentName: HEAVY_ROOM, bytes: LARGE_ROOM_STATE_BYTES + 1 });
  release.unloaded({ documentName: HEAVY_ROOM, isReloaded: () => true });
  await afterReleaseDelay();
  expect(collectGarbage).not.toHaveBeenCalled();
  release.grew({ documentName: HEAVY_ROOM, bytes: LARGE_ROOM_STATE_BYTES + 1 });
  release.unloaded({ documentName: HEAVY_ROOM, isReloaded: () => false });
  await afterReleaseDelay();
  expect(collectGarbage).toHaveBeenCalledOnce();
});

test('a room grown by several updates is heavy once their bytes pass the size', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const { collectGarbage, release } = releaseWith({ readings: [1, 2] });
  [LARGE_ROOM_STATE_BYTES / 2, LARGE_ROOM_STATE_BYTES / 2, 1].forEach((bytes) => release.grew({ documentName: HEAVY_ROOM, bytes }));
  release.unloaded({ documentName: HEAVY_ROOM, isReloaded: () => false });
  await afterReleaseDelay();
  expect(collectGarbage).toHaveBeenCalledOnce();
});

test('the bytes of an unloaded room are forgotten, so a small room of the same name later is not heavy', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const { collectGarbage, release } = releaseWith({ readings: [1, 2], clock: () => Date.now() });
  release.grew({ documentName: HEAVY_ROOM, bytes: LARGE_ROOM_STATE_BYTES + 1 });
  release.unloaded({ documentName: HEAVY_ROOM, isReloaded: () => true });
  release.grew({ documentName: HEAVY_ROOM, bytes: 1 });
  release.unloaded({ documentName: HEAVY_ROOM, isReloaded: () => false });
  await vi.advanceTimersByTimeAsync(COOLDOWN_MS + ROOM_MEMORY_RELEASE_DELAY_MS);
  expect(collectGarbage).not.toHaveBeenCalled();
});

const HEAVY_BYTES = LARGE_ROOM_STATE_BYTES + 1;
const HEAP_PER_BYTE = HEAVY_ROOM_HEAP_BYTES_PER_STATE_BYTE;
const HEAVY_HEAP_BYTES = HEAVY_BYTES * HEAP_PER_BYTE;
const HUGE_BYTES = 5 * LARGE_ROOM_STATE_BYTES;

test('the heavy heap is the state of every room above the large room limit times the heap per state byte, and an unloaded room leaves it', () => {
  const { release } = releaseWith({ readings: [] });
  release.grew({ documentName: HEAVY_ROOM, bytes: HEAVY_BYTES });
  release.grew({ documentName: SMALL_ROOM, bytes: LARGE_ROOM_STATE_BYTES });
  expect(release.heavyHeapBytes()).toBe(HEAVY_HEAP_BYTES);
  release.grew({ documentName: OTHER_HEAVY_ROOM, bytes: LARGE_ROOM_STATE_BYTES });
  release.grew({ documentName: OTHER_HEAVY_ROOM, bytes: HUGE_BYTES - LARGE_ROOM_STATE_BYTES });
  expect(release.heavyHeapBytes()).toBe(HEAVY_HEAP_BYTES + HUGE_BYTES * HEAP_PER_BYTE);
  release.unloaded({ documentName: HEAVY_ROOM, isReloaded: () => false });
  expect(release.heavyHeapBytes()).toBe(HUGE_BYTES * HEAP_PER_BYTE);
});

test('a room is admitted while its estimate fits the budget beside the loaded rooms, and a loaded room is always admitted', () => {
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: 2 * HEAVY_HEAP_BYTES });
  expect(release.isBounded()).toBe(true);
  release.grew({ documentName: HEAVY_ROOM, bytes: HEAVY_BYTES });
  release.grew({ documentName: OTHER_HEAVY_ROOM, bytes: HEAVY_BYTES });
  expect(release.admit({ documentName: THIRD_HEAVY_ROOM, estimatedStateBytes: HEAVY_BYTES, userId: ANA })).toBe(false);
  expect(release.admit({ documentName: OTHER_HEAVY_ROOM, estimatedStateBytes: HEAVY_BYTES, userId: ANA })).toBe(true);
  release.unloaded({ documentName: HEAVY_ROOM, isReloaded: () => false });
  expect(release.admit({ documentName: THIRD_HEAVY_ROOM, estimatedStateBytes: HEAVY_BYTES, userId: ANA })).toBe(true);
});

test('the budget is spent by the size of the state, so one huge room leaves less than a count of rooms would', () => {
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: 2 * HUGE_BYTES * HEAP_PER_BYTE });
  release.grew({ documentName: HEAVY_ROOM, bytes: HUGE_BYTES + HUGE_BYTES / 2 });
  expect(release.admit({ documentName: OTHER_HEAVY_ROOM, estimatedStateBytes: HUGE_BYTES, userId: ANA })).toBe(false);
  expect(release.admit({ documentName: OTHER_HEAVY_ROOM, estimatedStateBytes: HUGE_BYTES / 2, userId: ANA })).toBe(true);
});

test('an admitted room holds its estimate against the next opener until it loads, and a reservation that never loaded expires', () => {
  const clock = { currentMs: 0 };
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: HEAVY_HEAP_BYTES, clock: () => clock.currentMs });
  expect(release.admit({ documentName: HEAVY_ROOM, estimatedStateBytes: HEAVY_BYTES, userId: ANA })).toBe(true);
  expect(release.admit({ documentName: OTHER_HEAVY_ROOM, estimatedStateBytes: HEAVY_BYTES, userId: ANA })).toBe(false);
  expect(release.admit({ documentName: HEAVY_ROOM, estimatedStateBytes: HEAVY_BYTES, userId: ANA })).toBe(true);
  release.grew({ documentName: HEAVY_ROOM, bytes: HEAVY_BYTES });
  expect(release.heavyHeapBytes()).toBe(HEAVY_HEAP_BYTES);
  release.unloaded({ documentName: HEAVY_ROOM, isReloaded: () => false });
  expect(release.admit({ documentName: THIRD_HEAVY_ROOM, estimatedStateBytes: HEAVY_BYTES, userId: ANA })).toBe(true);
  expect(release.admit({ documentName: OTHER_HEAVY_ROOM, estimatedStateBytes: HEAVY_BYTES, userId: ANA })).toBe(false);
  clock.currentMs += ROOM_RESERVATION_TTL_MS;
  expect(release.admit({ documentName: OTHER_HEAVY_ROOM, estimatedStateBytes: HEAVY_BYTES, userId: ANA })).toBe(true);
});

test('headroom for a new room is checked against loaded rooms and reservations without taking a place', () => {
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: HEAVY_HEAP_BYTES });
  expect(release.hasHeadroomFor(HEAVY_BYTES)).toBe(true);
  expect(release.hasHeadroomFor(HEAVY_BYTES)).toBe(true);
  release.admit({ documentName: HEAVY_ROOM, estimatedStateBytes: HEAVY_BYTES, userId: ANA });
  expect(release.hasHeadroomFor(HEAVY_BYTES)).toBe(false);
});

test('without a budget nothing is bounded, admitted rooms are not tracked and every room has headroom', () => {
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: null });
  [HEAVY_ROOM, OTHER_HEAVY_ROOM, THIRD_HEAVY_ROOM].forEach((documentName) => release.grew({ documentName, bytes: HUGE_BYTES }));
  expect(release.isBounded()).toBe(false);
  expect(release.admit({ documentName: 'fourth-room', estimatedStateBytes: HUGE_BYTES, userId: ANA })).toBe(true);
  expect(release.hasHeadroomFor(HUGE_BYTES)).toBe(true);
});

const BYTES_BELOW_LARGE = LARGE_ROOM_STATE_BYTES - 5 * 1024 * 1024;
const BIG_BUDGET_BYTES = 100 * HEAVY_HEAP_BYTES;

test('one user may hold only so many heavy rooms, a room already held or loaded costs no place, and another user is unaffected', () => {
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: BIG_BUDGET_BYTES });
  const rooms = Array.from({ length: MAX_HEAVY_ROOMS_PER_USER }, (_, index) => `held-${index}`);
  rooms.forEach((documentName) => expect(release.admit({ documentName, estimatedStateBytes: HEAVY_BYTES, userId: ANA })).toBe(true));
  expect(release.admit({ documentName: 'one-too-many', estimatedStateBytes: HEAVY_BYTES, userId: ANA })).toBe(false);
  expect(release.admit({ documentName: rooms[0]!, estimatedStateBytes: HEAVY_BYTES, userId: ANA })).toBe(true);
  expect(release.admit({ documentName: 'one-too-many', estimatedStateBytes: HEAVY_BYTES, userId: BRUNO })).toBe(true);
  release.loaded({ documentName: 'one-too-many', bytes: HEAVY_BYTES });
  expect(release.admit({ documentName: 'one-too-many', estimatedStateBytes: HEAVY_BYTES, userId: ANA })).toBe(true);
  release.unloaded({ documentName: rooms[1]!, isReloaded: () => false });
  expect(release.admit({ documentName: 'after-unload', estimatedStateBytes: HEAVY_BYTES, userId: BRUNO })).toBe(true);
});

test('a reservation that expired no longer counts against the user', () => {
  const clock = { currentMs: 0 };
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: BIG_BUDGET_BYTES, clock: () => clock.currentMs });
  Array.from({ length: MAX_HEAVY_ROOMS_PER_USER }, (_, index) => `held-${index}`).forEach((documentName) =>
    release.admit({ documentName, estimatedStateBytes: HEAVY_BYTES, userId: ANA }),
  );
  clock.currentMs += ROOM_RESERVATION_TTL_MS;
  expect(release.admit({ documentName: 'fresh', estimatedStateBytes: HEAVY_BYTES, userId: ANA })).toBe(true);
});

test('at the budget the heavy rooms nobody edited for a minute are closed, then the opener is still refused until they unload', () => {
  const clock = { currentMs: 0 };
  const closeRoom = vi.fn();
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: 2 * HEAVY_HEAP_BYTES, clock: () => clock.currentMs, closeRoom });
  release.loaded({ documentName: HEAVY_ROOM, bytes: HEAVY_BYTES });
  release.loaded({ documentName: OTHER_HEAVY_ROOM, bytes: HEAVY_BYTES });
  clock.currentMs += HEAVY_ROOM_IDLE_MS - 1;
  release.grew({ documentName: OTHER_HEAVY_ROOM, bytes: 1 });
  clock.currentMs += 1;
  expect(release.admit({ documentName: THIRD_HEAVY_ROOM, estimatedStateBytes: HEAVY_BYTES, userId: BRUNO })).toBe(false);
  expect(closeRoom.mock.calls).toEqual([[HEAVY_ROOM]]);
  release.unloaded({ documentName: HEAVY_ROOM, isReloaded: () => false });
  expect(release.admit({ documentName: THIRD_HEAVY_ROOM, estimatedStateBytes: HEAVY_BYTES, userId: BRUNO })).toBe(true);
});

test('nothing is closed while the budget has room, and the room being asked for is never the one closed', () => {
  const clock = { currentMs: 0 };
  const closeRoom = vi.fn();
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: HEAVY_HEAP_BYTES, clock: () => clock.currentMs, closeRoom });
  release.loaded({ documentName: HEAVY_ROOM, bytes: HEAVY_BYTES });
  clock.currentMs += 10 * HEAVY_ROOM_IDLE_MS;
  expect(release.admit({ documentName: HEAVY_ROOM, estimatedStateBytes: HEAVY_BYTES, userId: ANA })).toBe(true);
  expect(closeRoom).not.toHaveBeenCalled();
});

test('the size of a room is its loaded state, measured again once enough updates arrived, not the sum of every update it ever received', () => {
  const { release } = releaseWith({ readings: [] });
  release.loaded({ documentName: SMALL_ROOM, bytes: BYTES_BELOW_LARGE });
  expect(release.isDueForMeasure(SMALL_ROOM)).toBe(false);
  release.grew({ documentName: SMALL_ROOM, bytes: 3 * 1024 * 1024 });
  expect(release.isDueForMeasure(SMALL_ROOM)).toBe(false);
  release.grew({ documentName: SMALL_ROOM, bytes: 3 * 1024 * 1024 });
  expect(release.isDueForMeasure(SMALL_ROOM)).toBe(true);
  expect(release.heavyHeapBytes()).toBe(0);
  release.measured({ documentName: SMALL_ROOM, bytes: BYTES_BELOW_LARGE });
  expect(release.isDueForMeasure(SMALL_ROOM)).toBe(false);
  expect(release.heavyHeapBytes()).toBe(0);
  release.measured({ documentName: SMALL_ROOM, bytes: HEAVY_BYTES });
  expect(release.heavyHeapBytes()).toBe(HEAVY_HEAP_BYTES);
});
