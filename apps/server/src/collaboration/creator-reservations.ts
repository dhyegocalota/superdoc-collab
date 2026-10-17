export type CreatorReservation = { documentId: string; userId: string; attempt: number; expiresAt: number };

export class CreatorReservations {
  constructor({ reservationMs, now = () => Date.now() }: { reservationMs: number; now?: () => number }) {
    throw new Error('CreatorReservations is not implemented');
  }

  reserve({ documentId, userId }: { documentId: string; userId: string }): number | null {
    throw new Error('CreatorReservations is not implemented');
  }

  attemptOf({ documentId, userId }: { documentId: string; userId: string }): number | null {
    throw new Error('CreatorReservations is not implemented');
  }

  mayWrite({ documentId, attempt }: { documentId: string; attempt: number | null }): boolean {
    throw new Error('CreatorReservations is not implemented');
  }

  release({ documentId, attempt }: { documentId: string; attempt: number }): void {
    throw new Error('CreatorReservations is not implemented');
  }

  forget(documentId: string): void {
    throw new Error('CreatorReservations is not implemented');
  }
}
