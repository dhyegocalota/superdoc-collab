export type CreatorReservation = { documentId: string; userId: string; attempt: number; expiresAt: number };

const NO_ATTEMPT_ISSUED = 0;

export class CreatorReservations {
  private readonly held = new Map<string, CreatorReservation>();
  private readonly latestAttempts = new Map<string, number>();
  private readonly reservationMs: number;
  private readonly now: () => number;

  constructor({ reservationMs, now = () => Date.now() }: { reservationMs: number; now?: () => number }) {
    this.reservationMs = reservationMs;
    this.now = now;
  }

  reserve({ documentId, userId }: { documentId: string; userId: string }): number | null {
    const current = this.held.get(documentId);
    const isLive = current !== undefined && current.expiresAt > this.now();
    if (isLive && current.userId === userId) return current.attempt;
    if (isLive) return null;
    const attempt = this.latestAttemptOf(documentId) + 1;
    this.held.set(documentId, { documentId, userId, attempt, expiresAt: this.now() + this.reservationMs });
    this.latestAttempts.set(documentId, attempt);
    return attempt;
  }

  attemptOf({ documentId, userId }: { documentId: string; userId: string }): number | null {
    const current = this.held.get(documentId);
    if (current === undefined) return null;
    if (current.userId !== userId) return null;
    return current.attempt;
  }

  // NB ADR 0033: the fence is the latest attempt issued, not a live reservation, so an expired creator may still commit until someone takes over.
  mayWrite({ documentId, attempt }: { documentId: string; attempt: number | null }): boolean {
    if (attempt === null) return false;
    return attempt === this.latestAttemptOf(documentId);
  }

  release({ documentId, attempt }: { documentId: string; attempt: number }): void {
    if (this.held.get(documentId)?.attempt !== attempt) return;
    this.held.delete(documentId);
  }

  forget(documentId: string): void {
    this.held.delete(documentId);
    this.latestAttempts.delete(documentId);
  }

  private latestAttemptOf(documentId: string): number {
    const latest = this.latestAttempts.get(documentId);
    if (latest === undefined) return NO_ATTEMPT_ISSUED;
    return latest;
  }
}
