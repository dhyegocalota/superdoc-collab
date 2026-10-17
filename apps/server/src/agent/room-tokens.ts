import { MINUTE_MS } from '@superdoc-history/types';

export const ROOM_TOKEN_TTL_MS = 5 * MINUTE_MS;

export function signRoomToken(_: { secret: string; userId: string; documentId: string; now: number }): string {
  throw new Error('signRoomToken is not implemented');
}

export function verifyRoomToken(_: { secret: string; token: string; documentId: string; now: number }): { userId: string } | null {
  throw new Error('verifyRoomToken is not implemented');
}
