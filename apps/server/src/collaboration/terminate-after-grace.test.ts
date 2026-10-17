import { SOCKET_CLOSE_GRACE_MS } from '@superdoc-collab/types';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { terminateAfterGrace } from './terminate-after-grace';

function closingSocket(): { socket: WebSocket; terminate: ReturnType<typeof vi.fn> } {
  const terminate = vi.fn();
  const socket = Object.assign(new EventEmitter(), { terminate }) as unknown as WebSocket;
  return { socket, terminate };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test('a peer that never answers the close frame is terminated after the grace period', () => {
  const { socket, terminate } = closingSocket();
  terminateAfterGrace(socket);
  vi.advanceTimersByTime(SOCKET_CLOSE_GRACE_MS - 1);
  expect(terminate).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(terminate).toHaveBeenCalledOnce();
});

test('a socket that closes within the grace period is left alone', () => {
  const { socket, terminate } = closingSocket();
  terminateAfterGrace(socket);
  socket.emit('close');
  vi.advanceTimersByTime(SOCKET_CLOSE_GRACE_MS * 2);
  expect(terminate).not.toHaveBeenCalled();
});
