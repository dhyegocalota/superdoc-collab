export class KeyedSlidingWindow {
  constructor(_parameters: { windowMs: number; maxEvents: number; now?: () => number }) {}

  waitMs(_key: string): number | null {
    throw new Error('KeyedSlidingWindow is not implemented');
  }

  record(_key: string): void {
    throw new Error('KeyedSlidingWindow is not implemented');
  }
}
