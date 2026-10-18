import { MAX_SOCKET_AWARENESS_FRAMES_PER_SECOND, MAX_SOCKET_UPDATE_FRAMES_PER_SECOND, SECOND_MS } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { awarenessFrame, syncStepOneFrame } from '../testing/socket-frames';
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
