import { KEYED_WINDOW_MAX_KEYS } from '@superdoc-collab/types';
import { LruMap } from './lru-map';
import { SlidingWindow } from './sliding-window';

export class KeyedSlidingWindow {
  private readonly windows: LruMap<SlidingWindow>;
  private readonly windowMs: number;
  private readonly maxEvents: number;
  private readonly now: () => number;

  constructor({
    windowMs,
    maxEvents,
    maxKeys = KEYED_WINDOW_MAX_KEYS,
    now = () => Date.now(),
  }: {
    windowMs: number;
    maxEvents: number;
    maxKeys?: number;
    now?: () => number;
  }) {
    this.windows = new LruMap({ isOverBudget: (entries) => entries.size > maxKeys });
    this.windowMs = windowMs;
    this.maxEvents = maxEvents;
    this.now = now;
  }

  waitMs(key: string): number | null {
    const window = this.windows.get(key);
    if (window === null) return null;
    if (window.count() < this.maxEvents) return null;
    const oldest = window.oldest();
    if (oldest === null) return null;
    return this.windowMs - (this.now() - oldest);
  }

  record(key: string): void {
    this.windowOf(key).record();
  }

  private windowOf(key: string): SlidingWindow {
    const existing = this.windows.get(key);
    if (existing !== null) return existing;
    const created = new SlidingWindow({ windowMs: this.windowMs, now: this.now });
    this.windows.set({ key, value: created });
    return created;
  }
}
