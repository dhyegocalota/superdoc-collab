export class SlidingWindow {
  readonly windowMs: number;

  constructor({ windowMs }: { windowMs: number; now?: () => number }) {
    this.windowMs = windowMs;
  }

  record(): void {
    throw new Error('SlidingWindow.record is not implemented');
  }

  count(): number {
    throw new Error('SlidingWindow.count is not implemented');
  }

  oldest(): number | null {
    throw new Error('SlidingWindow.oldest is not implemented');
  }
}
