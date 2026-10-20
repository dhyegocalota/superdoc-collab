import { LARGE_ROOM_STATE_BYTES } from '@superdoc-collab/types';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createRoomMemoryRelease, ROOM_MEMORY_RELEASE_DELAY_MS, ROOM_MEMORY_RELEASED_MESSAGE } from './room-memory-release';

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

function releaseWith({ readings, clock = () => 0 }: { readings: number[]; clock?: () => number }) {
  const collectGarbage = vi.fn();
  const release = createRoomMemoryRelease({
    collectGarbage,
    memoryUsage: residentReadings(readings),
    cooldownMs: COOLDOWN_MS,
    now: clock,
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
