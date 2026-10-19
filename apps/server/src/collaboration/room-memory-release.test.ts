import { LARGE_ROOM_STATE_BYTES } from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { createRoomMemoryRelease, ROOM_MEMORY_RELEASED_MESSAGE } from './room-memory-release';

const RESIDENT_BEFORE_BYTES = 3_000_000_000;
const RESIDENT_AFTER_BYTES = 900_000_000;
const HEAVY_ROOM = 'heavy-room';
const OTHER_HEAVY_ROOM = 'other-heavy-room';
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

function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
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

test('a heavy room that unloads gets one last-resort, synchronous collection after the unload returns, logged with the pause', async () => {
  const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const times = [0, 0, PAUSE_MS];
  const { collectGarbage, release } = releaseWith({
    readings: [RESIDENT_BEFORE_BYTES, RESIDENT_AFTER_BYTES],
    clock: () => times.shift() as number,
  });
  release.observe({ documentName: HEAVY_ROOM, stateBytes: LARGE_ROOM_STATE_BYTES + 1 });
  release.unloaded(HEAVY_ROOM);
  expect(collectGarbage).not.toHaveBeenCalled();
  await nextMacrotask();
  expect(collectGarbage).toHaveBeenCalledExactlyOnceWith({ type: 'major', execution: 'sync', flavor: 'last-resort' });
  expect(consoleInfo).toHaveBeenCalledWith(`${ROOM_MEMORY_RELEASED_MESSAGE} ${RESIDENT_BEFORE_BYTES} ${RESIDENT_AFTER_BYTES} ${PAUSE_MS}`);
  consoleInfo.mockRestore();
});

test('a small room that unloads while a heavy one is open collects nothing', async () => {
  const { collectGarbage, release } = releaseWith({ readings: [] });
  release.observe({ documentName: SMALL_ROOM, stateBytes: LARGE_ROOM_STATE_BYTES });
  release.unloaded(SMALL_ROOM);
  await nextMacrotask();
  expect(collectGarbage).not.toHaveBeenCalled();
});

test('a second heavy unload inside the cooldown collects nothing', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const { collectGarbage, release } = releaseWith({ readings: [1, 2] });
  [HEAVY_ROOM, OTHER_HEAVY_ROOM].forEach((documentName) => {
    release.observe({ documentName, stateBytes: LARGE_ROOM_STATE_BYTES + 1 });
    release.unloaded(documentName);
  });
  await nextMacrotask();
  expect(collectGarbage).toHaveBeenCalledOnce();
});

test('a room unloaded twice is collected for once', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const { collectGarbage, release } = releaseWith({ readings: [1, 2] });
  release.observe({ documentName: HEAVY_ROOM, stateBytes: LARGE_ROOM_STATE_BYTES + 1 });
  release.unloaded(HEAVY_ROOM);
  release.unloaded(HEAVY_ROOM);
  await nextMacrotask();
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
  release.observe({ documentName: HEAVY_ROOM, stateBytes: LARGE_ROOM_STATE_BYTES + 1 });
  release.unloaded(HEAVY_ROOM);
  await nextMacrotask();
  expect(consoleInfo).not.toHaveBeenCalled();
  consoleInfo.mockRestore();
});
