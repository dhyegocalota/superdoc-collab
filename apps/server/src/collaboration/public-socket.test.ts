import {
  ApiPath,
  PUBLIC_SOCKET_ADMISSIONS_PER_MINUTE,
  publicApiPath,
  publicUserIdOf,
  type PublicOpened,
  PublicAccess,
  anonymousViewerOf,
  RETRY_AFTER_HEADER,
} from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import WebSocket from 'ws';
import { signRoomToken } from '../agent/room-tokens';
import { CollaborationRefusedError, connectAsVisitor, connectToDocument, documentWithOwner } from '../testing/collaboration-client';
import { commitBootstrap } from '../testing/committed-room';
import { TEST_AUTH_SECRET, type TestServer } from '../testing/test-server';
import { signPublicRoomToken } from './public-room-tokens';
import { SUPERDOC_ROOM_PREFIX } from './room-name';

const FORWARDED_FOR_HEADER = 'x-forwarded-for';
const SWITCHING_PROTOCOLS_STATUS = 101;
const TOO_MANY_REQUESTS_STATUS = 429;
const FAILED_UPGRADE_STATUS = 0;
const OLD_TOKEN_TIME = 1000;

async function publicRoom() {
  const { server, documentId, owner } = await documentWithOwner();
  commitBootstrap({ services: server.services, documentId, userId: owner.id });
  server.services.documents.setPublic({ documentId, isPublic: true });
  return { server, documentId, owner };
}

async function visitorToken({ server, documentId }: { server: TestServer; documentId: string }): Promise<string> {
  const opened: PublicOpened = await (await fetch(`${server.baseUrl}${publicApiPath(documentId)}`)).json();
  if (opened.access !== PublicAccess.Visitor) throw new Error('A visitor was expected');
  return opened.roomToken;
}

function roomConnections({ server, documentId }: { server: TestServer; documentId: string }) {
  const room = server.services.hocuspocus.documents.get(`${SUPERDOC_ROOM_PREFIX}${documentId}`);
  if (!room) throw new Error('The room is not loaded.');
  return [...room.connections.values()].map(({ connection }) => connection);
}

function upgradeStatusOf({ server, address }: { server: TestServer; address: string }): Promise<{ status: number; retryAfter: unknown }> {
  return new Promise((resolve) => {
    const socket = new WebSocket(`${server.baseUrl.replace('http', 'ws')}${ApiPath.PublicCollaboration}`, {
      origin: server.baseUrl,
      headers: { [FORWARDED_FOR_HEADER]: address },
    });
    socket.on('open', () => {
      socket.close();
      resolve({ status: SWITCHING_PROTOCOLS_STATUS, retryAfter: null });
    });
    socket.on('unexpected-response', (_request, response) => {
      response.resume();
      resolve({ status: response.statusCode as number, retryAfter: response.headers[RETRY_AFTER_HEADER.toLowerCase()] });
    });
    socket.on('error', () => resolve({ status: FAILED_UPGRADE_STATUS, retryAfter: null }));
  });
}

test('a public token admits a read-only socket that is never a member', async () => {
  const { server, documentId, owner } = await publicRoom();
  const token = await visitorToken({ server, documentId });
  const visitor = await connectAsVisitor({ server, token, documentId });
  const [connection] = roomConnections({ server, documentId });
  const { userId } = connection!.context as { userId: string };
  expect(connection!.readOnly).toBe(true);
  expect(userId.startsWith(publicUserIdOf(''))).toBe(true);
  expect(server.services.documents.findRole({ documentId, userId })).toBeNull();
  expect(server.services.documents.members(documentId).map((member) => member.user.id)).toEqual([owner.id]);
  visitor.close();
  await server.stop();
});

test('a visitor reads the text a member writes, live', async () => {
  const { server, documentId, owner } = await publicRoom();
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId, bootstrapToken: null });
  const visitor = await connectAsVisitor({ server, token: await visitorToken({ server, documentId }), documentId });
  ownerClient.document.getText('t').insert(0, 'hello visitor');
  await expect.poll(() => visitor.document.getText('t').toString()).toBe('hello visitor');
  [ownerClient, visitor].forEach((client) => client.close());
  await server.stop();
});

type Refusal = { name: string; token: (scenario: { server: TestServer; documentId: string; ownerId: string }) => Promise<string> | string };

const REFUSALS: Refusal[] = [
  { name: 'a placeholder token', token: () => 'x' },
  { name: 'garbage', token: () => 'not.a.token' },
  {
    name: 'an expired token',
    token: ({ documentId }) =>
      signPublicRoomToken({ secret: TEST_AUTH_SECRET, documentId, viewer: anonymousViewerOf('visitor-1'), now: OLD_TOKEN_TIME }),
  },
  {
    name: 'a token for another document',
    token: () =>
      signPublicRoomToken({ secret: TEST_AUTH_SECRET, documentId: randomUUID(), viewer: anonymousViewerOf('visitor-1'), now: Date.now() }),
  },
  {
    name: 'an agent token',
    token: ({ documentId, ownerId }) => signRoomToken({ secret: TEST_AUTH_SECRET, userId: ownerId, documentId, now: Date.now() }),
  },
];

test.each(REFUSALS)('$name is refused', async ({ token }) => {
  const { server, documentId, owner } = await publicRoom();
  const presented = await token({ server, documentId, ownerId: owner.id });
  await expect(connectAsVisitor({ server, token: presented, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
  await server.stop();
});

test('a valid token is refused once the document is private again', async () => {
  const { server, documentId } = await publicRoom();
  const token = await visitorToken({ server, documentId });
  server.services.documents.setPublic({ documentId, isPublic: false });
  await expect(connectAsVisitor({ server, token, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
  await server.stop();
});

test.each([
  { name: 'no Origin', origin: undefined },
  { name: 'another Origin', origin: 'http://evil.example' },
])('a valid token with $name is refused', async ({ origin }) => {
  const { server, documentId } = await publicRoom();
  const token = await visitorToken({ server, documentId });
  const attempt = connectAsVisitor({ server, token, documentId, origin: origin as string });
  await expect(attempt).rejects.toBeInstanceOf(CollaborationRefusedError);
  await server.stop();
});

test('a valid token for a room that is not committed is refused', async () => {
  const { server, documentId } = await documentWithOwner();
  server.services.documents.setPublic({ documentId, isPublic: true });
  const token = signPublicRoomToken({ secret: TEST_AUTH_SECRET, documentId, viewer: anonymousViewerOf('visitor-1'), now: Date.now() });
  await expect(connectAsVisitor({ server, token, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
  expect(server.services.openBudget.trackedPairs()).toBe(0);
  await server.stop();
});

test('an address past the admission window is answered 429 with Retry-After and another address is not', async () => {
  const { server } = await publicRoom();
  const admitted = await Promise.all(
    Array.from({ length: PUBLIC_SOCKET_ADMISSIONS_PER_MINUTE }, () => upgradeStatusOf({ server, address: '10.3.0.1' })),
  );
  const refused = await upgradeStatusOf({ server, address: '10.3.0.1' });
  const otherAddress = await upgradeStatusOf({ server, address: '10.3.0.2' });
  expect(admitted.map(({ status }) => status)).toEqual(admitted.map(() => SWITCHING_PROTOCOLS_STATUS));
  expect(refused.status).toBe(TOO_MANY_REQUESTS_STATUS);
  expect(Number(refused.retryAfter)).toBeGreaterThan(0);
  expect(otherAddress.status).toBe(SWITCHING_PROTOCOLS_STATUS);
  await server.stop();
});
