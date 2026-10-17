import type { WebSocket } from 'ws';

export function terminateAfterGrace(_socket: WebSocket): void {
  throw new Error('terminateAfterGrace is not implemented');
}
