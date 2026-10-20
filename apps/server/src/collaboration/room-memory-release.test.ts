import {
  BYTES_PER_MEGABYTE,
  HEAVY_ROOM_HEAP_BYTES_PER_STATE_BYTE,
  LARGE_ROOM_STATE_BYTES,
  MAX_HEAVY_ROOMS_PER_USER,
  SMALL_ROOMS_HEAP_SHARE,
} from '@superdoc-collab/types';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  createRoomMemoryRelease,
  ROOM_MEMORY_RELEASE_DELAY_MS,
  ROOM_MEMORY_RELEASED_MESSAGE,
  ROOM_REMEASURE_COOLDOWN_MS,
  ROOM_RESERVATION_TTL_MS,
  ROOM_UPLOAD_RESERVATION_TTL_MS,
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
  measureRoom = () => null,
}: {
  readings: number[];
  clock?: () => number;
  roomHeapBudgetBytes?: number | null;
  measureRoom?: (documentName: string) => number | null;
}) {
  const collectGarbage = vi.fn();
  const release = createRoomMemoryRelease({
    collectGarbage,
    memoryUsage: residentReadings(readings),
    cooldownMs: COOLDOWN_MS,
    now: clock,
    roomHeapBudgetBytes,
    measureRoom,
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
    measureRoom: () => null,
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
const MEGABYTES_BELOW_LARGE = 2;

function budgetForHeavyRooms(count: number): number {
  return Math.ceil((count * HEAVY_HEAP_BYTES) / (1 - SMALL_ROOMS_HEAP_SHARE)) + HEAP_PER_BYTE;
}

function admission(documentName: string, userId = ANA) {
  return { documentName, estimatedStateBytes: HEAVY_BYTES, userId };
}

test('the rooms heap is the state of every room, small ones too, times the heap per state byte, and an unloaded room leaves it', () => {
  const { release } = releaseWith({ readings: [] });
  release.grew({ documentName: HEAVY_ROOM, bytes: HEAVY_BYTES });
  release.grew({ documentName: SMALL_ROOM, bytes: LARGE_ROOM_STATE_BYTES });
  expect(release.roomsHeapBytes()).toBe((HEAVY_BYTES + LARGE_ROOM_STATE_BYTES) * HEAP_PER_BYTE);
  release.grew({ documentName: OTHER_HEAVY_ROOM, bytes: LARGE_ROOM_STATE_BYTES });
  release.grew({ documentName: OTHER_HEAVY_ROOM, bytes: HUGE_BYTES - LARGE_ROOM_STATE_BYTES });
  expect(release.roomsHeapBytes()).toBe((HEAVY_BYTES + LARGE_ROOM_STATE_BYTES + HUGE_BYTES) * HEAP_PER_BYTE);
  release.unloaded({ documentName: HEAVY_ROOM, isReloaded: () => false });
  expect(release.roomsHeapBytes()).toBe((LARGE_ROOM_STATE_BYTES + HUGE_BYTES) * HEAP_PER_BYTE);
});

test('a room is admitted while its estimate fits the budget beside the loaded rooms, and a loaded room is always admitted', () => {
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: budgetForHeavyRooms(2) });
  expect(release.isBounded()).toBe(true);
  release.grew({ documentName: HEAVY_ROOM, bytes: HEAVY_BYTES });
  release.grew({ documentName: OTHER_HEAVY_ROOM, bytes: HEAVY_BYTES });
  expect(release.admit(admission(THIRD_HEAVY_ROOM, BRUNO))).toBe(false);
  expect(release.admit(admission(OTHER_HEAVY_ROOM))).toBe(true);
  release.unloaded({ documentName: HEAVY_ROOM, isReloaded: () => false });
  expect(release.admit(admission(THIRD_HEAVY_ROOM, BRUNO))).toBe(true);
});

test('heavy rooms may use only their share of the budget, the rest is kept for small rooms', () => {
  const budgetBytes = Math.ceil(3.5 * HEAVY_HEAP_BYTES);
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: budgetBytes });
  release.grew({ documentName: HEAVY_ROOM, bytes: HEAVY_BYTES });
  release.grew({ documentName: OTHER_HEAVY_ROOM, bytes: HEAVY_BYTES });
  expect(release.roomsHeapBytes() + HEAVY_HEAP_BYTES).toBeLessThanOrEqual(budgetBytes);
  expect(release.admit(admission(THIRD_HEAVY_ROOM, BRUNO))).toBe(false);
});

test('small rooms count against the budget too, so heavy rooms cannot take what the small ones already hold', () => {
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: budgetForHeavyRooms(2) });
  const smallBytes = LARGE_ROOM_STATE_BYTES - MEGABYTES_BELOW_LARGE * BYTES_PER_MEGABYTE;
  ['small-1', 'small-2', 'small-3'].forEach((documentName) => release.grew({ documentName, bytes: smallBytes }));
  expect(release.admit(admission(HEAVY_ROOM))).toBe(false);
  release.unloaded({ documentName: 'small-1', isReloaded: () => false });
  release.unloaded({ documentName: 'small-2', isReloaded: () => false });
  expect(release.admit(admission(HEAVY_ROOM))).toBe(true);
});

test('the budget is spent by the size of the state, so one huge room leaves less than a count of rooms would', () => {
  const { release } = releaseWith({
    readings: [],
    roomHeapBudgetBytes: Math.ceil((2 * HUGE_BYTES * HEAP_PER_BYTE) / (1 - SMALL_ROOMS_HEAP_SHARE)),
  });
  release.grew({ documentName: HEAVY_ROOM, bytes: HUGE_BYTES + HUGE_BYTES / 2 });
  expect(release.admit({ ...admission(OTHER_HEAVY_ROOM), estimatedStateBytes: HUGE_BYTES })).toBe(false);
  expect(release.admit({ ...admission(OTHER_HEAVY_ROOM), estimatedStateBytes: HUGE_BYTES / 2 })).toBe(true);
});

test('an admitted room holds its estimate against the next opener until it loads, and a reservation that never loaded expires', () => {
  const clock = { currentMs: 0 };
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: budgetForHeavyRooms(1), clock: () => clock.currentMs });
  expect(release.admit(admission(HEAVY_ROOM))).toBe(true);
  expect(release.admit(admission(OTHER_HEAVY_ROOM, BRUNO))).toBe(false);
  expect(release.admit(admission(HEAVY_ROOM))).toBe(true);
  release.loaded({ documentName: HEAVY_ROOM, bytes: HEAVY_BYTES });
  expect(release.roomsHeapBytes()).toBe(HEAVY_HEAP_BYTES);
  release.unloaded({ documentName: HEAVY_ROOM, isReloaded: () => false });
  expect(release.admit(admission(THIRD_HEAVY_ROOM))).toBe(true);
  expect(release.admit(admission(OTHER_HEAVY_ROOM, BRUNO))).toBe(false);
  clock.currentMs += ROOM_RESERVATION_TTL_MS;
  expect(release.admit(admission(OTHER_HEAVY_ROOM, BRUNO))).toBe(true);
});

test('a reservation made for an upload outlives a socket reservation, up to its own time limit', () => {
  const clock = { currentMs: 0 };
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: budgetForHeavyRooms(1), clock: () => clock.currentMs });
  expect(release.reserveForUpload(admission(HEAVY_ROOM))).toBe(true);
  clock.currentMs += ROOM_RESERVATION_TTL_MS;
  expect(release.admit(admission(OTHER_HEAVY_ROOM, BRUNO))).toBe(false);
  clock.currentMs += ROOM_UPLOAD_RESERVATION_TTL_MS;
  expect(release.admit(admission(OTHER_HEAVY_ROOM, BRUNO))).toBe(true);
});

test('headroom for a new room is checked against loaded rooms and reservations without taking a place', () => {
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: budgetForHeavyRooms(1) });
  expect(release.hasHeadroomFor(HEAVY_BYTES)).toBe(true);
  expect(release.hasHeadroomFor(HEAVY_BYTES)).toBe(true);
  release.admit(admission(HEAVY_ROOM));
  expect(release.hasHeadroomFor(HEAVY_BYTES)).toBe(false);
});

test('without a budget nothing is bounded, admitted rooms are not tracked and every room has headroom', () => {
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: null });
  [HEAVY_ROOM, OTHER_HEAVY_ROOM, THIRD_HEAVY_ROOM].forEach((documentName) => release.grew({ documentName, bytes: HUGE_BYTES }));
  expect(release.isBounded()).toBe(false);
  expect(release.admit({ ...admission('fourth-room'), estimatedStateBytes: HUGE_BYTES })).toBe(true);
  expect(release.hasHeadroomFor(HUGE_BYTES)).toBe(true);
});

const BYTES_BELOW_LARGE_START = LARGE_ROOM_STATE_BYTES - 7 * BYTES_PER_MEGABYTE;
const BIG_BUDGET_BYTES = 100 * budgetForHeavyRooms(1);

test('one user may hold only so many heavy rooms, a room already held or loaded costs no place, and another user is unaffected', () => {
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: BIG_BUDGET_BYTES });
  const rooms = Array.from({ length: MAX_HEAVY_ROOMS_PER_USER }, (_, index) => `held-${index}`);
  rooms.forEach((documentName) => expect(release.admit(admission(documentName))).toBe(true));
  expect(release.admit(admission('one-too-many'))).toBe(false);
  expect(release.admit(admission(rooms[0]!))).toBe(true);
  expect(release.admit(admission('one-too-many', BRUNO))).toBe(true);
  release.loaded({ documentName: 'one-too-many', bytes: HEAVY_BYTES });
  expect(release.admit(admission('one-too-many'))).toBe(true);
  release.unloaded({ documentName: rooms[1]!, isReloaded: () => false });
  expect(release.admit(admission('after-unload', BRUNO))).toBe(true);
});

test('fitting obeys the share of a user without counting it, and never takes a place', () => {
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: budgetForHeavyRooms(1) });
  Array.from({ length: 5 }).forEach(() => expect(release.fits(admission(HEAVY_ROOM))).toBe(true));
  expect(release.admit(admission(OTHER_HEAVY_ROOM, BRUNO))).toBe(true);
  expect(release.fits(admission(HEAVY_ROOM))).toBe(false);
  expect(release.fits(admission(OTHER_HEAVY_ROOM))).toBe(true);
  const sharing = releaseWith({ readings: [], roomHeapBudgetBytes: BIG_BUDGET_BYTES });
  Array.from({ length: MAX_HEAVY_ROOMS_PER_USER }, (_, index) => `held-${index}`).forEach((documentName) =>
    sharing.release.admit(admission(documentName)),
  );
  expect(sharing.release.fits(admission('new-room'))).toBe(false);
  expect(sharing.release.fits(admission('new-room', BRUNO))).toBe(true);
});

test('the last socket of a user on a room gives their place back, and a reservation nobody holds any more is dropped', () => {
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: BIG_BUDGET_BYTES });
  const rooms = Array.from({ length: MAX_HEAVY_ROOMS_PER_USER }, (_, index) => `held-${index}`);
  rooms.forEach((documentName) => release.admit(admission(documentName)));
  release.admit(admission(rooms[0]!));
  release.released({ documentName: rooms[0]!, userId: ANA });
  expect(release.admit(admission('another', ANA))).toBe(false);
  release.released({ documentName: rooms[0]!, userId: ANA });
  expect(release.admit(admission('another', ANA))).toBe(true);
  expect(release.roomsHeapBytes()).toBe(HEAVY_HEAP_BYTES * 2);
});

test('a loaded room keeps its bytes when its last socket closes', () => {
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: BIG_BUDGET_BYTES });
  release.admit(admission(HEAVY_ROOM));
  release.loaded({ documentName: HEAVY_ROOM, bytes: HEAVY_BYTES });
  release.released({ documentName: HEAVY_ROOM, userId: ANA });
  expect(release.roomsHeapBytes()).toBe(HEAVY_HEAP_BYTES);
});

test('rooms that received updates are measured again only when an admission is short of headroom', () => {
  const measureRoom = vi.fn((documentName: string) => (documentName === HEAVY_ROOM ? LARGE_ROOM_STATE_BYTES - BYTES_PER_MEGABYTE : null));
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: budgetForHeavyRooms(2), measureRoom });
  release.loaded({ documentName: HEAVY_ROOM, bytes: BYTES_BELOW_LARGE_START });
  release.grew({ documentName: HEAVY_ROOM, bytes: HUGE_BYTES });
  expect(release.admit(admission(OTHER_HEAVY_ROOM, BRUNO))).toBe(true);
  expect(measureRoom).toHaveBeenCalledTimes(1);
  expect(measureRoom).toHaveBeenCalledWith(HEAVY_ROOM);
  expect(release.admit(admission(THIRD_HEAVY_ROOM, BRUNO))).toBe(false);
  expect(measureRoom).toHaveBeenCalledTimes(1);
});

test('a room with no updates since it loaded is never measured, and a room that cannot be measured keeps its bytes', () => {
  const measureRoom = vi.fn(() => null);
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: budgetForHeavyRooms(1), measureRoom });
  release.loaded({ documentName: HEAVY_ROOM, bytes: HEAVY_BYTES });
  expect(release.admit(admission(OTHER_HEAVY_ROOM, BRUNO))).toBe(false);
  expect(measureRoom).not.toHaveBeenCalled();
  release.grew({ documentName: HEAVY_ROOM, bytes: 1 });
  expect(release.admit(admission(OTHER_HEAVY_ROOM, BRUNO))).toBe(false);
  expect(measureRoom).toHaveBeenCalledWith(HEAVY_ROOM);
});

test('fitting measures a room that received updates when short, and not otherwise', () => {
  const measureRoom = vi.fn(() => 1);
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: budgetForHeavyRooms(1), measureRoom });
  release.loaded({ documentName: HEAVY_ROOM, bytes: HEAVY_BYTES });
  release.grew({ documentName: HEAVY_ROOM, bytes: 1 });
  expect(release.fits(admission(OTHER_HEAVY_ROOM, BRUNO))).toBe(true);
  expect(measureRoom).toHaveBeenCalledTimes(1);
});

test('one owner holds at most one reservation made for an upload, until its room loads or it is released', () => {
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: BIG_BUDGET_BYTES });
  expect(release.reserveForUpload(admission(HEAVY_ROOM))).toBe(true);
  expect(release.reserveForUpload(admission(OTHER_HEAVY_ROOM))).toBe(false);
  expect(release.reserveForUpload(admission(OTHER_HEAVY_ROOM, BRUNO))).toBe(true);
  release.loaded({ documentName: HEAVY_ROOM, bytes: HEAVY_BYTES });
  expect(release.reserveForUpload(admission(THIRD_HEAVY_ROOM))).toBe(true);
  expect(release.reserveForUpload(admission('fourth-room'))).toBe(false);
  release.unreserved(THIRD_HEAVY_ROOM);
  expect(release.reserveForUpload(admission('fourth-room'))).toBe(true);
});

test('releasing a reservation frees its heap, and leaves a loaded room alone', () => {
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: BIG_BUDGET_BYTES });
  release.reserveForUpload(admission(HEAVY_ROOM));
  release.reserveForUpload(admission(OTHER_HEAVY_ROOM, BRUNO));
  release.loaded({ documentName: OTHER_HEAVY_ROOM, bytes: HEAVY_BYTES });
  expect(release.roomsHeapBytes()).toBe(2 * HEAVY_HEAP_BYTES);
  release.unreserved(HEAVY_ROOM);
  release.unreserved(OTHER_HEAVY_ROOM);
  expect(release.roomsHeapBytes()).toBe(HEAVY_HEAP_BYTES);
});

test('rooms are measured again at most once per cooldown, however many admissions are short', () => {
  const clock = { currentMs: 0 };
  const measureRoom = vi.fn(() => HEAVY_BYTES);
  const { release } = releaseWith({ readings: [], roomHeapBudgetBytes: budgetForHeavyRooms(1), measureRoom, clock: () => clock.currentMs });
  release.loaded({ documentName: HEAVY_ROOM, bytes: HEAVY_BYTES });
  const probe = () => {
    release.grew({ documentName: HEAVY_ROOM, bytes: 1 });
    return release.fits(admission(OTHER_HEAVY_ROOM, BRUNO));
  };
  Array.from({ length: 5 }).forEach(probe);
  expect(measureRoom).toHaveBeenCalledTimes(1);
  clock.currentMs += ROOM_REMEASURE_COOLDOWN_MS;
  probe();
  expect(measureRoom).toHaveBeenCalledTimes(2);
});
