import { ClientActor, MINUTE_MS } from '@superdoc-collab/types';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const ROOM_TOKEN_TTL_MS = 5 * MINUTE_MS;

const SIGNATURE_DIGEST = 'sha256';
const ROOM_TOKEN_KEY_LABEL = 'agent-room-token';
const PARTS_SEPARATOR = '.';
const EXPECTED_PARTS = 2;

type RoomTokenClaims = { userId: string; documentId: string; actor: ClientActor; attempt: string | null; expiresAt: number };

function sign({ secret, label, payload }: { secret: string; label: string; payload: string }): Buffer {
  const key = createHmac(SIGNATURE_DIGEST, secret).update(label).digest();
  return createHmac(SIGNATURE_DIGEST, key).update(payload).digest();
}

function parseClaims<Claims>(payload: string): Claims | null {
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()) as Claims;
  } catch {
    return null;
  }
}

export function sealClaims<Claims extends object>({ secret, label, claims }: { secret: string; label: string; claims: Claims }): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}${PARTS_SEPARATOR}${sign({ secret, label, payload }).toString('base64url')}`;
}

export function openClaims<Claims>({ secret, label, token }: { secret: string; label: string; token: string }): Claims | null {
  const parts = token.split(PARTS_SEPARATOR);
  if (parts.length !== EXPECTED_PARTS) return null;
  const [payload, signature] = parts as [string, string];
  const expected = sign({ secret, label, payload });
  const presented = Buffer.from(signature, 'base64url');
  if (presented.length !== expected.length) return null;
  if (!timingSafeEqual(presented, expected)) return null;
  return parseClaims<Claims>(payload);
}

function signClaims({ secret, claims }: { secret: string; claims: RoomTokenClaims }): string {
  return sealClaims({ secret, label: ROOM_TOKEN_KEY_LABEL, claims });
}

function verifyClaims({
  secret,
  token,
  documentId,
  actor,
  now,
}: {
  secret: string;
  token: string;
  documentId: string;
  actor: ClientActor;
  now: number;
}): RoomTokenClaims | null {
  const claims = openClaims<RoomTokenClaims>({ secret, label: ROOM_TOKEN_KEY_LABEL, token });
  if (!claims) return null;
  const isForDocument = claims.documentId === documentId && claims.actor === actor;
  const isLive = claims.expiresAt > now;
  if (!isForDocument || !isLive) return null;
  return claims;
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
  return signClaims({
    secret,
    claims: { userId, documentId, actor: ClientActor.Agent, attempt: null, expiresAt: now + ROOM_TOKEN_TTL_MS },
  });
}

export function verifyRoomToken(parameters: { secret: string; token: string; documentId: string; now: number }): { userId: string } | null {
  const claims = verifyClaims({ ...parameters, actor: ClientActor.Agent });
  if (!claims) return null;
  return { userId: claims.userId };
}

export function signBootstrapToken({
  secret,
  userId,
  documentId,
  attempt,
  now,
}: {
  secret: string;
  userId: string;
  documentId: string;
  attempt: string;
  now: number;
}): string {
  return signClaims({ secret, claims: { userId, documentId, actor: ClientActor.Human, attempt, expiresAt: now + ROOM_TOKEN_TTL_MS } });
}

export function verifyBootstrapToken(parameters: {
  secret: string;
  token: string;
  documentId: string;
  now: number;
}): { userId: string; attempt: string } | null {
  const claims = verifyClaims({ ...parameters, actor: ClientActor.Human });
  if (!claims) return null;
  if (claims.attempt === null) return null;
  return { userId: claims.userId, attempt: claims.attempt };
}
