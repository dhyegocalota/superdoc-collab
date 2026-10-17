export class KeyedCooldown {
  private readonly startedAt = new Map<string, number>();
  private readonly durationMs: number;
  private readonly now: () => number;

  constructor({ durationMs, now = () => Date.now() }: { durationMs: number; now?: () => number }) {
    this.durationMs = durationMs;
    this.now = now;
  }

  start(key: string): void {
    this.startedAt.set(key, this.now());
  }

  remainingMs(key: string): number {
    const startedAt = this.startedAt.get(key);
    if (startedAt === undefined) return 0;
    const remaining = this.durationMs - (this.now() - startedAt);
    if (remaining > 0) return remaining;
    this.startedAt.delete(key);
    return 0;
  }

  forget(key: string): void {
    this.startedAt.delete(key);
  }

  keys(): string[] {
    throw new Error('KeyedCooldown.keys is not implemented');
  }

  size(): number {
    return this.startedAt.size;
  }
}
