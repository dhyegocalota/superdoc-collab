export class SlidingWindow {
  private readonly times: number[] = [];
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor({ windowMs, now = () => Date.now() }: { windowMs: number; now?: () => number }) {
    this.windowMs = windowMs;
    this.now = now;
  }

  record(): void {
    this.times.push(this.now());
  }

  count(): number {
    this.prune();
    return this.times.length;
  }

  oldest(): number | null {
    this.prune();
    const [oldest] = this.times;
    if (oldest === undefined) return null;
    return oldest;
  }

  private prune(): void {
    const windowStart = this.now() - this.windowMs;
    const firstRecent = this.times.findIndex((time) => time > windowStart);
    const staleCount = firstRecent === -1 ? this.times.length : firstRecent;
    this.times.splice(0, staleCount);
  }
}
