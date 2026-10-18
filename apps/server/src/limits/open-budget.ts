import { KeyedCooldown } from './keyed-cooldown';
import { KeyedSlidingWindow } from './keyed-sliding-window';

export class OpenBudget {
  private readonly documents: KeyedSlidingWindow;
  private readonly counted: KeyedCooldown;

  constructor({ windowMs, maxDocuments, now = () => Date.now() }: { windowMs: number; maxDocuments: number; now?: () => number }) {
    this.documents = new KeyedSlidingWindow({ windowMs, maxEvents: maxDocuments, now });
    this.counted = new KeyedCooldown({ durationMs: windowMs, now });
  }

  waitMs({ userId, documentId }: { userId: string; documentId: string }): number | null {
    if (this.isCounted({ userId, documentId })) return null;
    return this.documents.waitMs(userId);
  }

  record({ userId, documentId }: { userId: string; documentId: string }): void {
    if (this.isCounted({ userId, documentId })) return;
    this.counted.keys().forEach((key) => this.counted.remainingMs(key));
    this.documents.record(userId);
    this.counted.start(`${userId}:${documentId}`);
  }

  trackedPairs(): number {
    return this.counted.keys().length;
  }

  private isCounted({ userId, documentId }: { userId: string; documentId: string }): boolean {
    return this.counted.remainingMs(`${userId}:${documentId}`) > 0;
  }
}
