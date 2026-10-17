export class DocumentCooldown {
  private readonly startedAt = new Map<string, number>();
  private readonly durationMs: number;
  private readonly now: () => number;

  constructor({ durationMs, now = () => Date.now() }: { durationMs: number; now?: () => number }) {
    this.durationMs = durationMs;
    this.now = now;
  }

  start(documentId: string): void {
    this.startedAt.set(documentId, this.now());
  }

  remainingMs(documentId: string): number {
    const startedAt = this.startedAt.get(documentId);
    if (startedAt === undefined) return 0;
    const remaining = this.durationMs - (this.now() - startedAt);
    if (remaining > 0) return remaining;
    this.startedAt.delete(documentId);
    return 0;
  }

  forget(documentId: string): void {
    this.startedAt.delete(documentId);
  }

  size(): number {
    return this.startedAt.size;
  }
}
