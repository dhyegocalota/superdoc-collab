import { CREATOR_RESERVATION_MAX_MS, type CreatorTicket } from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import { KeyedCooldown } from '../limits/keyed-cooldown';

export type CreatorReservation = { documentId: string; userId: string; attempt: number; reservedAt: number; expiresAt: number };

const NO_ATTEMPT_ISSUED = 0;

export class CreatorReservations {
  readonly epoch = randomUUID();
  private readonly held = new Map<string, CreatorReservation>();
  private readonly latestAttempts = new Map<string, number>();
  private readonly reservationMs: number;
  private readonly maxLifetimeMs: number;
  private readonly lapses: KeyedCooldown;
  private readonly now: () => number;

  constructor({
    reservationMs,
    maxLifetimeMs = CREATOR_RESERVATION_MAX_MS,
    now = () => Date.now(),
  }: {
    reservationMs: number;
    maxLifetimeMs?: number;
    now?: () => number;
  }) {
    this.reservationMs = reservationMs;
    this.maxLifetimeMs = maxLifetimeMs;
    this.lapses = new KeyedCooldown({ durationMs: reservationMs, now });
    this.now = now;
  }

  reserve({ documentId, userId }: { documentId: string; userId: string }): CreatorTicket | null {
    const lapseKey = `${documentId}:${userId}`;
    if (this.lapses.remainingMs(lapseKey) > 0) return null;
    const current = this.held.get(documentId);
    const isLive = current !== undefined && current.expiresAt > this.now();
    const isContinuation = current !== undefined && current.userId === userId && this.now() < current.expiresAt + this.reservationMs;
    if (isLive && !isContinuation) return null;
    const hasLapsedAtCap = isContinuation && this.now() >= current.reservedAt + this.maxLifetimeMs;
    if (hasLapsedAtCap) {
      this.lapses.start(lapseKey);
      this.held.delete(documentId);
      return null;
    }
    const attempt = this.latestAttemptOf(documentId) + 1;
    const reservedAt = isContinuation ? current.reservedAt : this.now();
    const expiresAt = Math.min(this.now() + this.reservationMs, reservedAt + this.maxLifetimeMs);
    this.held.set(documentId, { documentId, userId, attempt, reservedAt, expiresAt });
    this.latestAttempts.set(documentId, attempt);
    return { attempt, epoch: this.epoch };
  }

  attemptOf({ documentId, userId }: { documentId: string; userId: string }): number | null {
    const current = this.held.get(documentId);
    if (current === undefined) return null;
    if (current.userId !== userId) return null;
    return current.attempt;
  }

  // NB ADR 0033: the fence is the latest attempt issued in this epoch, and a committed room accepts that same attempt (it is the one that committed) or a socket that claims none.
  mayWrite({
    documentId,
    attempt,
    epoch,
    isCommitted,
  }: {
    documentId: string;
    attempt: number | null;
    epoch: string | null;
    isCommitted: boolean;
  }): boolean {
    if (attempt === null) return isCommitted;
    if (epoch !== this.epoch) return false;
    return attempt === this.latestAttemptOf(documentId);
  }

  commit(documentId: string): void {
    this.held.delete(documentId);
  }

  touch({ documentId, attempt }: { documentId: string; attempt: number }): void {
    const current = this.held.get(documentId);
    if (current === undefined) return;
    const expiresAt = Math.min(this.now() + this.reservationMs, current.reservedAt + this.maxLifetimeMs);
    this.reschedule({ documentId, attempt, expiresAt });
  }

  release({ documentId, attempt }: { documentId: string; attempt: number }): void {
    this.reschedule({ documentId, attempt, expiresAt: this.now() });
  }

  forget(documentId: string): void {
    this.held.delete(documentId);
    this.lapses
      .keys()
      .filter((key) => key.startsWith(`${documentId}:`))
      .forEach((key) => this.lapses.forget(key));
    this.latestAttempts.delete(documentId);
  }

  private reschedule({ documentId, attempt, expiresAt }: { documentId: string; attempt: number; expiresAt: number }): void {
    const current = this.held.get(documentId);
    if (current === undefined) return;
    if (current.attempt !== attempt) return;
    this.held.set(documentId, { ...current, expiresAt });
  }

  private latestAttemptOf(documentId: string): number {
    const latest = this.latestAttempts.get(documentId);
    if (latest === undefined) return NO_ATTEMPT_ISSUED;
    return latest;
  }
}
