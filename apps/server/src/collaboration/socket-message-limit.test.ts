import {
  MAX_AWARENESS_ENTRIES_PER_FRAME,
  MAX_SOCKET_AWARENESS_FRAMES_PER_SECOND,
  MAX_SOCKET_UPDATE_FRAMES_PER_SECOND,
  SECOND_MS,
} from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import {
  awarenessFrame,
  awarenessFrameClaiming,
  PaddedVarintField,
  paddedAwarenessFrame,
  syncStepOneFrame,
} from '../testing/socket-frames';
import { SocketMessageLimit } from './socket-message-limit';

const ROOM_NAME = 'superdoc-room-1';
const AWARENESS_BURST_FRAMES = 3000;

function burst({ limit, socket, frame, count }: { limit: SocketMessageLimit; socket: object; frame: Buffer; count: number }): boolean[] {
  return Array.from({ length: count }, () => limit.breached({ socket, frame }));
}

test('the last update frame under the cap in a second is accepted and the next breaches', () => {
  const limit = new SocketMessageLimit({ now: () => 0 });
  const socket = {};
  const frame = syncStepOneFrame(ROOM_NAME);
  expect(burst({ limit, socket, frame, count: MAX_SOCKET_UPDATE_FRAMES_PER_SECOND }).some(Boolean)).toBe(false);
  expect(limit.breached({ socket, frame })).toBe(true);
});

test('the last awareness frame under its own cap in a second is accepted and the next breaches', () => {
  const limit = new SocketMessageLimit({ now: () => 0 });
  const socket = {};
  const frame = awarenessFrame(ROOM_NAME);
  expect(burst({ limit, socket, frame, count: MAX_SOCKET_AWARENESS_FRAMES_PER_SECOND }).some(Boolean)).toBe(false);
  expect(limit.breached({ socket, frame })).toBe(true);
});

test('an awareness burst does not use the update budget', () => {
  const limit = new SocketMessageLimit({ now: () => 0 });
  const socket = {};
  expect(burst({ limit, socket, frame: awarenessFrame(ROOM_NAME), count: AWARENESS_BURST_FRAMES }).some(Boolean)).toBe(false);
  expect(burst({ limit, socket, frame: syncStepOneFrame(ROOM_NAME), count: MAX_SOCKET_UPDATE_FRAMES_PER_SECOND }).some(Boolean)).toBe(
    false,
  );
});

test('messages older than a second stop counting', () => {
  const clock = { time: 0 };
  const limit = new SocketMessageLimit({ now: () => clock.time });
  const socket = {};
  const frame = syncStepOneFrame(ROOM_NAME);
  burst({ limit, socket, frame, count: MAX_SOCKET_UPDATE_FRAMES_PER_SECOND });
  clock.time += SECOND_MS + 1;
  expect(limit.breached({ socket, frame })).toBe(false);
});

test('each socket has its own windows', () => {
  const limit = new SocketMessageLimit({ now: () => 0 });
  const frame = syncStepOneFrame(ROOM_NAME);
  burst({ limit, socket: {}, frame, count: MAX_SOCKET_UPDATE_FRAMES_PER_SECOND + 1 });
  expect(limit.breached({ socket: {}, frame })).toBe(false);
});

function claimingFrame(count: number): Buffer {
  return awarenessFrameClaiming({ roomName: ROOM_NAME, clientIds: Array.from({ length: count }, (_, index) => index + 1) });
}

test('an awareness frame claiming one entry more than the frame cap claims too many', () => {
  const limit = new SocketMessageLimit();
  expect(limit.claimsTooManyEntries(claimingFrame(MAX_AWARENESS_ENTRIES_PER_FRAME + 1))).toBe(true);
});

const PADDED_ENTRY_COUNT = 100_000;
const OVERLONG_FRAME_BYTES = 1024;
const CONTINUING_BYTE = 0x80;

test('a frame whose room name length never ends claims too many', () => {
  const frame = Buffer.alloc(OVERLONG_FRAME_BYTES, CONTINUING_BYTE);
  expect(new SocketMessageLimit().claimsTooManyEntries(frame)).toBe(true);
});

Object.values(PaddedVarintField).forEach((paddedField) =>
  test(`an awareness frame with a padded ${paddedField} claims too many`, () => {
    const frame = paddedAwarenessFrame({ roomName: ROOM_NAME, paddedField, claimedEntryCount: PADDED_ENTRY_COUNT });
    expect(new SocketMessageLimit().claimsTooManyEntries(frame)).toBe(true);
  }),
);

const PINNED_CLOCK = 2 ** 53;

test('a well-formed clock of 2 to the 53 claims nothing at the ws layer', () => {
  const frame = awarenessFrameClaiming({ roomName: ROOM_NAME, clientIds: [1], clock: PINNED_CLOCK, state: null });
  expect(new SocketMessageLimit().claimsTooManyEntries(frame)).toBe(false);
});

test('awareness frames claiming up to the frame cap, other frames and unreadable frames do not', () => {
  const limit = new SocketMessageLimit();
  const frames = [claimingFrame(MAX_AWARENESS_ENTRIES_PER_FRAME), awarenessFrame(ROOM_NAME), syncStepOneFrame(ROOM_NAME), Buffer.from([0])];
  expect(frames.map((frame) => limit.claimsTooManyEntries(frame))).toEqual([false, false, false, false]);
});
