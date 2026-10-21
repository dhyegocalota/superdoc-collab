import type { PublicViewer } from '@superdoc-collab/types';

export function signPublicRoomToken(parameters: { secret: string; documentId: string; viewer: PublicViewer; now: number }): string {
  throw new Error(`signPublicRoomToken is not implemented for ${parameters.documentId}`);
}

export function verifyPublicRoomToken(parameters: { secret: string; token: string; documentId: string; now: number }): PublicViewer | null {
  throw new Error(`verifyPublicRoomToken is not implemented for ${parameters.documentId}`);
}
