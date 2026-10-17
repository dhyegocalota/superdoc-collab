import { SOCKET_CLOSE_GRACE_MS } from '@superdoc-collab/types';
import type { WebSocket } from 'ws';

export function terminateAfterGrace(socket: WebSocket): void {
  const timer = setTimeout(() => socket.terminate(), SOCKET_CLOSE_GRACE_MS);
  socket.once('close', () => clearTimeout(timer));
}
