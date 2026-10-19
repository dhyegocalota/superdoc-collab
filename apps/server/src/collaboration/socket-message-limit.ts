import {
  MAX_AWARENESS_ENTRIES_PER_FRAME,
  MAX_SOCKET_AWARENESS_FRAMES_PER_SECOND,
  MAX_SOCKET_UPDATE_FRAMES_PER_SECOND,
  SECOND_MS,
} from '@superdoc-collab/types';
import type { RawData } from 'ws';
import { SlidingWindow } from '../limits/sliding-window';
import { awarenessEntryCountOf, FrameBucket, frameBucketOf } from './frame-bucket';

const CAP_BY_BUCKET: Record<FrameBucket, number> = {
  [FrameBucket.Updates]: MAX_SOCKET_UPDATE_FRAMES_PER_SECOND,
  [FrameBucket.Awareness]: MAX_SOCKET_AWARENESS_FRAMES_PER_SECOND,
};

export class SocketMessageLimit {
  private readonly windows = new WeakMap<object, Record<FrameBucket, SlidingWindow>>();
  private readonly now: () => number;

  constructor({ now = () => Date.now() }: { now?: () => number } = {}) {
    this.now = now;
  }

  // NB ADR 0040: every frame counts from the first one, before authentication, in the bucket of its kind, and the frame past that bucket's cap breaches.
  breached({ socket, frame }: { socket: object; frame: RawData }): boolean {
    const bucket = frameBucketOf(frame);
    const window = this.windowsOf(socket)[bucket];
    window.record();
    return window.count() > CAP_BY_BUCKET[bucket];
  }

  // NB ADR 0040: the ws layer reads an awareness frame only as far as its entry count, so a frame claiming more entries than the frame cap never reaches the room.
  claimsTooManyEntries(frame: RawData): boolean {
    const entryCount = awarenessEntryCountOf(frame);
    return entryCount !== null && entryCount > MAX_AWARENESS_ENTRIES_PER_FRAME;
  }

  claimsPinnedClock(frame: RawData): boolean {
    throw new Error('claimsPinnedClock is not implemented');
  }

  private windowsOf(socket: object): Record<FrameBucket, SlidingWindow> {
    const existing = this.windows.get(socket);
    if (existing !== undefined) return existing;
    const created = {
      [FrameBucket.Updates]: new SlidingWindow({ windowMs: SECOND_MS, now: this.now }),
      [FrameBucket.Awareness]: new SlidingWindow({ windowMs: SECOND_MS, now: this.now }),
    };
    this.windows.set(socket, created);
    return created;
  }
}
