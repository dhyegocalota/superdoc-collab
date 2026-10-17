export class DocumentCooldown {
  constructor(_options: { durationMs: number; now?: () => number }) {}

  start(_documentId: string): void {}

  remainingMs(_documentId: string): number {
    return 0;
  }

  forget(_documentId: string): void {}

  size(): number {
    return 0;
  }
}
