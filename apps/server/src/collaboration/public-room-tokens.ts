import type { PublicViewer } from '@superdoc-collab/types';
import { openClaims, ROOM_TOKEN_TTL_MS, sealClaims } from '../agent/room-tokens';

const PUBLIC_ROOM_TOKEN_KEY_LABEL = 'public-room-token';

type PublicRoomTokenClaims = { documentId: string; viewer: PublicViewer; expiresAt: number };

export function signPublicRoomToken({
  secret,
  documentId,
  viewer,
  now,
}: {
  secret: string;
  documentId: string;
  viewer: PublicViewer;
  now: number;
}): string {
  return sealClaims<PublicRoomTokenClaims>({
    secret,
    label: PUBLIC_ROOM_TOKEN_KEY_LABEL,
    claims: { documentId, viewer, expiresAt: now + ROOM_TOKEN_TTL_MS },
  });
}

export function verifyPublicRoomToken({
  secret,
  token,
  documentId,
  now,
}: {
  secret: string;
  token: string;
  documentId: string;
  now: number;
}): PublicViewer | null {
  const claims = openClaims<PublicRoomTokenClaims>({ secret, label: PUBLIC_ROOM_TOKEN_KEY_LABEL, token });
  if (!claims) return null;
  const isForDocument = claims.documentId === documentId;
  const isLive = claims.expiresAt > now;
  if (!isForDocument || !isLive) return null;
  return claims.viewer;
}
