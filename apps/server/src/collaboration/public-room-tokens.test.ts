import { anonymousViewerOf, signedInViewerOf } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { ROOM_TOKEN_TTL_MS, signBootstrapToken, signRoomToken, verifyBootstrapToken, verifyRoomToken } from '../agent/room-tokens';
import { signPublicRoomToken, verifyPublicRoomToken } from './public-room-tokens';

const SECRET = 'public-token-secret-'.padEnd(32, 'x');
const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const NOW = 1_000_000;
const viewer = anonymousViewerOf('visitor-1');

function publicToken(): string {
  return signPublicRoomToken({ secret: SECRET, documentId: DOCUMENT_ID, viewer, now: NOW });
}

test('a public token verifies for its document and carries its viewer', () => {
  expect(verifyPublicRoomToken({ secret: SECRET, token: publicToken(), documentId: DOCUMENT_ID, now: NOW })).toEqual(viewer);
});

test('a signed-in viewer survives the round trip with the real name', () => {
  const signedIn = signedInViewerOf({ visitorId: 'visitor-2', name: 'Bruno' });
  const token = signPublicRoomToken({ secret: SECRET, documentId: DOCUMENT_ID, viewer: signedIn, now: NOW });
  expect(verifyPublicRoomToken({ secret: SECRET, token, documentId: DOCUMENT_ID, now: NOW })).toEqual(signedIn);
});

test('a public token expires with the room token lifetime', () => {
  const justBefore = NOW + ROOM_TOKEN_TTL_MS - 1;
  const atExpiry = NOW + ROOM_TOKEN_TTL_MS;
  expect(verifyPublicRoomToken({ secret: SECRET, token: publicToken(), documentId: DOCUMENT_ID, now: justBefore })).not.toBeNull();
  expect(verifyPublicRoomToken({ secret: SECRET, token: publicToken(), documentId: DOCUMENT_ID, now: atExpiry })).toBeNull();
});

test('a public token is refused for another document, another secret, a tampered body and garbage', () => {
  const token = publicToken();
  const [body, signature] = token.split('.') as [string, string];
  const tampered = `${Buffer.from(JSON.stringify({ documentId: DOCUMENT_ID })).toString('base64url')}.${signature}`;
  const attempts = [
    verifyPublicRoomToken({ secret: SECRET, token, documentId: OTHER_DOCUMENT_ID, now: NOW }),
    verifyPublicRoomToken({ secret: `${SECRET}-other`, token, documentId: DOCUMENT_ID, now: NOW }),
    verifyPublicRoomToken({ secret: SECRET, token: tampered, documentId: DOCUMENT_ID, now: NOW }),
    verifyPublicRoomToken({ secret: SECRET, token: body, documentId: DOCUMENT_ID, now: NOW }),
    verifyPublicRoomToken({ secret: SECRET, token: 'not a token', documentId: DOCUMENT_ID, now: NOW }),
  ];
  expect(attempts).toEqual([null, null, null, null, null]);
});

test('an agent token and a bootstrap token are not public tokens', () => {
  const agentToken = signRoomToken({ secret: SECRET, userId: 'user-1', documentId: DOCUMENT_ID, now: NOW });
  const bootstrapToken = signBootstrapToken({ secret: SECRET, userId: 'user-1', documentId: DOCUMENT_ID, attempt: 'attempt-1', now: NOW });
  expect(verifyPublicRoomToken({ secret: SECRET, token: agentToken, documentId: DOCUMENT_ID, now: NOW })).toBeNull();
  expect(verifyPublicRoomToken({ secret: SECRET, token: bootstrapToken, documentId: DOCUMENT_ID, now: NOW })).toBeNull();
});

test('a public token is neither an agent token nor a bootstrap token', () => {
  expect(verifyRoomToken({ secret: SECRET, token: publicToken(), documentId: DOCUMENT_ID, now: NOW })).toBeNull();
  expect(verifyBootstrapToken({ secret: SECRET, token: publicToken(), documentId: DOCUMENT_ID, now: NOW })).toBeNull();
});
