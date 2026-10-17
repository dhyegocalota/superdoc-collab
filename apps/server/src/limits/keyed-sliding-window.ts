import { SlidingWindow } from './sliding-window';

export class KeyedSlidingWindow {
  private readonly windows = new Map<string, SlidingWindow>();
  private readonly windowMs: number;
  private readonly maxEvents: number;
  private readonly now: () => number;

  constructor({ windowMs, maxEvents, now = () => Date.now() }: { windowMs: number; maxEvents: number; now?: () => number }) {
    this.windowMs = windowMs;
    this.maxEvents = maxEvents;
    this.now = now;
  }

  waitMs(key: string): number | null {
    const window = this.windowOf(key);
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
    if (existing !== undefined) return existing;
    const created = new SlidingWindow({ windowMs: this.windowMs, now: this.now });
    this.windows.set(key, created);
    return created;
  }
}
