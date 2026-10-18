import { MAX_SOCKET_MESSAGES_PER_SECOND, SECOND_MS } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { SocketMessageLimit } from './socket-message-limit';

function burst({ limit, socket, count }: { limit: SocketMessageLimit; socket: object; count: number }): boolean[] {
  return Array.from({ length: count }, () => limit.breached(socket));
}

test('the 120th message in a second is accepted and the 121st breaches', () => {
  const limit = new SocketMessageLimit({ now: () => 0 });
  const socket = {};
  const accepted = burst({ limit, socket, count: MAX_SOCKET_MESSAGES_PER_SECOND });
  expect(accepted.some(Boolean)).toBe(false);
  expect(limit.breached(socket)).toBe(true);
});

test('messages older than a second stop counting', () => {
  const clock = { time: 0 };
  const limit = new SocketMessageLimit({ now: () => clock.time });
  const socket = {};
  burst({ limit, socket, count: MAX_SOCKET_MESSAGES_PER_SECOND });
  clock.time += SECOND_MS + 1;
  expect(limit.breached(socket)).toBe(false);
});

test('each socket has its own window', () => {
  const limit = new SocketMessageLimit({ now: () => 0 });
  burst({ limit, socket: {}, count: MAX_SOCKET_MESSAGES_PER_SECOND + 1 });
  expect(limit.breached({})).toBe(false);
});
