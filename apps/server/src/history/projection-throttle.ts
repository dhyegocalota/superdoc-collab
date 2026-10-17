export const PROJECTION_THROTTLE_MS = 1500;

export class ProjectionThrottle {
  private readonly intervalMs: number;
  private readonly run: (documentId: string) => void;
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor({ intervalMs, run }: { intervalMs: number; run: (documentId: string) => void }) {
    this.intervalMs = intervalMs;
    this.run = run;
  }

  request(documentId: string): void {
    if (this.timers.has(documentId)) return;
    this.timers.set(
      documentId,
      setTimeout(() => {
        this.timers.delete(documentId);
        this.run(documentId);
      }, this.intervalMs),
    );
  }

  stop(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }
}
