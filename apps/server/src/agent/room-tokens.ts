import { ClientActor, MINUTE_MS } from '@superdoc-history/types';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const ROOM_TOKEN_TTL_MS = 5 * MINUTE_MS;

const SIGNATURE_DIGEST = 'sha256';
const PARTS_SEPARATOR = '.';
const EXPECTED_PARTS = 2;

type RoomTokenClaims = { userId: string; documentId: string; actor: ClientActor; expiresAt: number };

function sign({ secret, payload }: { secret: string; payload: string }): Buffer {
  return createHmac(SIGNATURE_DIGEST, secret).update(payload).digest();
}

function parseClaims(payload: string): RoomTokenClaims | null {
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()) as RoomTokenClaims;
  } catch {
    return null;
  }
}

export function signRoomToken({
  secret,
  userId,
  documentId,
  now,
}: {
  secret: string;
  userId: string;
  documentId: string;
  now: number;
}): string {
  const claims: RoomTokenClaims = { userId, documentId, actor: ClientActor.Agent, expiresAt: now + ROOM_TOKEN_TTL_MS };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}${PARTS_SEPARATOR}${sign({ secret, payload }).toString('base64url')}`;
}

export function verifyRoomToken({
  secret,
  token,
  documentId,
  now,
}: {
  secret: string;
  token: string;
  documentId: string;
  now: number;
}): { userId: string } | null {
  const parts = token.split(PARTS_SEPARATOR);
  if (parts.length !== EXPECTED_PARTS) return null;
  const [payload, signature] = parts as [string, string];
  const expected = sign({ secret, payload });
  const presented = Buffer.from(signature, 'base64url');
  if (presented.length !== expected.length) return null;
  if (!timingSafeEqual(presented, expected)) return null;
  const claims = parseClaims(payload);
  if (!claims) return null;
  const isForDocument = claims.documentId === documentId && claims.actor === ClientActor.Agent;
  const isLive = claims.expiresAt > now;
  if (!isForDocument || !isLive) return null;
  return { userId: claims.userId };
}
