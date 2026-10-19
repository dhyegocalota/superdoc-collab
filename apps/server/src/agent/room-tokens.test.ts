import { createHmac } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { ROOM_TOKEN_TTL_MS, signBootstrapToken, signRoomToken, verifyBootstrapToken, verifyRoomToken } from './room-tokens';

const SECRET = 'room-token-secret'.padEnd(32, 'x');
const OTHER_SECRET = 'another-secret'.padEnd(32, 'y');
const USER_ID = 'user-ana';
const DOCUMENT_ID = 'document-plan';
const OTHER_DOCUMENT_ID = 'document-budget';
const ATTEMPT = 'attempt-1';
const NOW = 1_800_000_000_000;
const TOKEN_PARTS_SEPARATOR = '.';

function unchanged(token: string): string {
  return token;
}

function withoutSignature(token: string): string {
  return token.split(TOKEN_PARTS_SEPARATOR)[0]!;
}

function withTamperedPayload(token: string): string {
  const [payload, signature] = token.split(TOKEN_PARTS_SEPARATOR) as [string, string];
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
  const forged = Buffer.from(JSON.stringify({ ...claims, userId: 'user-bruno' })).toString('base64url');
  return `${forged}${TOKEN_PARTS_SEPARATOR}${signature}`;
}

function withSignatureFromTheRawSecret(token: string): string {
  const [payload] = token.split(TOKEN_PARTS_SEPARATOR) as [string];
  const signature = createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}${TOKEN_PARTS_SEPARATOR}${signature}`;
}

function garbage(): string {
  return 'not a token';
}

function empty(): string {
  return '';
}

describe('room tokens', () => {
  test.each([
    { name: 'a valid token', present: unchanged, secret: SECRET, documentId: DOCUMENT_ID, now: NOW, expected: { userId: USER_ID } },
    {
      name: 'a token on its last millisecond',
      present: unchanged,
      secret: SECRET,
      documentId: DOCUMENT_ID,
      now: NOW + ROOM_TOKEN_TTL_MS - 1,
      expected: { userId: USER_ID },
    },
    {
      name: 'an expired token',
      present: unchanged,
      secret: SECRET,
      documentId: DOCUMENT_ID,
      now: NOW + ROOM_TOKEN_TTL_MS,
      expected: null,
    },
    { name: 'a token for another document', present: unchanged, secret: SECRET, documentId: OTHER_DOCUMENT_ID, now: NOW, expected: null },
    { name: 'a tampered payload', present: withTamperedPayload, secret: SECRET, documentId: DOCUMENT_ID, now: NOW, expected: null },
    {
      name: 'a token signed with another secret',
      present: unchanged,
      secret: OTHER_SECRET,
      documentId: DOCUMENT_ID,
      now: NOW,
      expected: null,
    },
    {
      name: 'a signature made directly with the secret',
      present: withSignatureFromTheRawSecret,
      secret: SECRET,
      documentId: DOCUMENT_ID,
      now: NOW,
      expected: null,
    },
    { name: 'a token without a signature', present: withoutSignature, secret: SECRET, documentId: DOCUMENT_ID, now: NOW, expected: null },
    { name: 'garbage', present: garbage, secret: SECRET, documentId: DOCUMENT_ID, now: NOW, expected: null },
    { name: 'an empty token', present: empty, secret: SECRET, documentId: DOCUMENT_ID, now: NOW, expected: null },
  ])('$name verifies as $expected', ({ present, secret, documentId, now, expected }) => {
    const issued = signRoomToken({ secret: SECRET, userId: USER_ID, documentId: DOCUMENT_ID, now: NOW });
    expect(verifyRoomToken({ secret, token: present(issued), documentId, now })).toEqual(expected);
  });
});

describe('bootstrap tokens', () => {
  const issued = () => signBootstrapToken({ secret: SECRET, userId: USER_ID, documentId: DOCUMENT_ID, attempt: ATTEMPT, now: NOW });

  test('a valid token verifies to its user and attempt', () => {
    expect(verifyBootstrapToken({ secret: SECRET, token: issued(), documentId: DOCUMENT_ID, now: NOW })).toEqual({
      userId: USER_ID,
      attempt: ATTEMPT,
    });
  });

  test.each([
    { name: 'an expired token', documentId: DOCUMENT_ID, secret: SECRET, now: NOW + ROOM_TOKEN_TTL_MS },
    { name: 'a token for another document', documentId: OTHER_DOCUMENT_ID, secret: SECRET, now: NOW },
    { name: 'a token signed with another secret', documentId: DOCUMENT_ID, secret: OTHER_SECRET, now: NOW },
  ])('$name does not verify', ({ documentId, secret, now }) => {
    expect(verifyBootstrapToken({ secret, token: issued(), documentId, now })).toBeNull();
  });

  test('an agent token is not a bootstrap token', () => {
    const agentToken = signRoomToken({ secret: SECRET, userId: USER_ID, documentId: DOCUMENT_ID, now: NOW });
    expect(verifyBootstrapToken({ secret: SECRET, token: agentToken, documentId: DOCUMENT_ID, now: NOW })).toBeNull();
  });

  test('a bootstrap token is not an agent token', () => {
    expect(verifyRoomToken({ secret: SECRET, token: issued(), documentId: DOCUMENT_ID, now: NOW })).toBeNull();
  });
});
