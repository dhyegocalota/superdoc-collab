import {
  MAX_AWARENESS_ENTRIES_PER_FRAME,
  MAX_SOCKET_MESSAGE_BYTES,
  MAX_SOCKET_AWARENESS_FRAMES_PER_SECOND,
  MAX_SOCKET_UPDATE_FRAMES_PER_SECOND,
  SECOND_MS,
} from '@superdoc-collab/types';
import type { RawData } from 'ws';
import { SlidingWindow } from '../limits/sliding-window';
import { awarenessEntryCountOf, FrameBucket, frameBucketOf } from './frame-bucket';

function byteLengthOf(frame: RawData): number {
  if (Array.isArray(frame)) return frame.reduce((total, chunk) => total + chunk.byteLength, 0);
  return frame.byteLength;
}

const CAP_BY_BUCKET: Record<FrameBucket, number> = {
  [FrameBucket.Updates]: MAX_SOCKET_UPDATE_FRAMES_PER_SECOND,
  [FrameBucket.Awareness]: MAX_SOCKET_AWARENESS_FRAMES_PER_SECOND,
};

const INFLATED_BUDGET_UNIT_BYTES = 16 * 1024;
export const MAX_INFLATED_BYTES_PER_SECOND = MAX_SOCKET_MESSAGE_BYTES;
const MAX_INFLATED_UNITS_PER_SECOND = MAX_INFLATED_BYTES_PER_SECOND / INFLATED_BUDGET_UNIT_BYTES;

export const PRE_AUTHENTICATION_MAX_INFLATED_BYTES = 64 * 1024;

export class SocketMessageLimit {
  private readonly windows = new WeakMap<object, Record<FrameBucket, SlidingWindow>>();
  private readonly inflatedWindows = new WeakMap<object, SlidingWindow>();
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

  // NB ADR 0034: ws inflates before the message event, so a 1000-frames-per-second cap alone allows a thousand frames of 80 KB that each inflate to the payload cap; the bytes a socket inflates in a second are capped at one maximum frame.
  exceedsInflatedBudget({ socket, frame }: { socket: object; frame: RawData }): boolean {
    const window = this.inflatedWindowOf(socket);
    Array.from({ length: Math.floor(byteLengthOf(frame) / INFLATED_BUDGET_UNIT_BYTES) }, () => window.record());
    return window.count() > MAX_INFLATED_UNITS_PER_SECOND;
  }

  markAnswered(_: object): void {
    throw new Error('markAnswered is not implemented');
  }

  exceedsPreAuthenticationBudget(_: { socket: object; frame: RawData }): boolean {
    throw new Error('exceedsPreAuthenticationBudget is not implemented');
  }

  private inflatedWindowOf(socket: object): SlidingWindow {
    const existing = this.inflatedWindows.get(socket);
    if (existing !== undefined) return existing;
    const created = new SlidingWindow({ windowMs: SECOND_MS, now: this.now });
    this.inflatedWindows.set(socket, created);
    return created;
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
