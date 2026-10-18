import { MAX_SOCKET_MESSAGES_PER_SECOND, SECOND_MS } from '@superdoc-collab/types';
import type { RawData } from 'ws';
import { SlidingWindow } from '../limits/sliding-window';

export class SocketMessageLimit {
  private readonly windows = new WeakMap<object, SlidingWindow>();
  private readonly now: () => number;

  constructor({ now = () => Date.now() }: { now?: () => number } = {}) {
    this.now = now;
  }

  // NB ADR 0034: every frame counts from the first one, before authentication, and the frame past the limit breaches.
  breached({ socket }: { socket: object; frame: RawData }): boolean {
    const window = this.windowOf(socket);
    window.record();
    return window.count() > MAX_SOCKET_MESSAGES_PER_SECOND;
  }

  private windowOf(socket: object): SlidingWindow {
    const existing = this.windows.get(socket);
    if (existing !== undefined) return existing;
    const created = new SlidingWindow({ windowMs: SECOND_MS, now: this.now });
    this.windows.set(socket, created);
    return created;
  }
}
