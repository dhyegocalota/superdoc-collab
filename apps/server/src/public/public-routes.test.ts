import {
  HttpStatus,
  publicApiPath,
  PUBLIC_PREPARING_MESSAGE,
  PUBLIC_RATE_LIMITED_MESSAGE,
  PUBLIC_READS_PER_MINUTE,
  PublicAccess,
  PublicAnimal,
  RETRY_AFTER_HEADER,
  type PublicOpened,
} from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { verifyPublicRoomToken } from '../collaboration/public-room-tokens';
import { FORWARDED_FOR_HEADER } from '../http/client-address';
import { documentWithOwner } from '../testing/collaboration-client';
import { commitBootstrap } from '../testing/committed-room';
import { publicRoom } from '../testing/public-room';
import { signedInUser, TEST_AUTH_SECRET, type TestServer } from '../testing/test-server';

const FIRST_ADDRESS = '10.1.0.1';
const SECOND_ADDRESS = '10.1.0.2';

function getPublic({
  server,
  documentId,
  cookie,
  address = FIRST_ADDRESS,
}: {
  server: TestServer;
  documentId: string;
  cookie?: string;
  address?: string;
}): Promise<Response> {
  const headers: Record<string, string> = { [FORWARDED_FOR_HEADER]: address };
  if (cookie !== undefined) headers.cookie = cookie;
  return fetch(`${server.baseUrl}${publicApiPath(documentId)}`, { headers });
}

test('a visitor with no session gets the document, an anonymous animal and a room token', async () => {
  const { server, documentId } = await publicRoom();
  const response = await getPublic({ server, documentId });
  const body: PublicOpened = await response.json();
  expect(response.status).toBe(HttpStatus.Ok);
  if (body.access !== PublicAccess.Visitor) throw new Error('A visitor was expected');
  expect(body.document).toEqual({ id: documentId, title: 'Shared plan' });
  expect(body.viewer.name).toBe(`Anonymous ${body.viewer.animal}`);
  expect(Object.values(PublicAnimal)).toContain(body.viewer.animal);
  const verified = verifyPublicRoomToken({ secret: TEST_AUTH_SECRET, token: body.roomToken, documentId, now: Date.now() });
  expect(verified).toEqual(body.viewer);
  expect(response.headers.get('cache-control')).toBe('no-store');
  await server.stop();
});

test('no email and no user id of the owner is anywhere in the answer', async () => {
  const { server, documentId, owner } = await publicRoom();
  const text = await (await getPublic({ server, documentId })).text();
  expect([text.includes('@'), text.includes(owner.id), text.includes(owner.email)]).toEqual([false, false, false]);
  await server.stop();
});

test('every visit is a new identity', async () => {
  const { server, documentId } = await publicRoom();
  const first: PublicOpened = await (await getPublic({ server, documentId })).json();
  const second: PublicOpened = await (await getPublic({ server, documentId })).json();
  if (first.access !== PublicAccess.Visitor || second.access !== PublicAccess.Visitor) throw new Error('Visitors were expected');
  expect([first.viewer.id === second.viewer.id, first.roomToken === second.roomToken]).toEqual([false, false]);
  await server.stop();
});

test('a missing document and a document that is not public answer the same', async () => {
  const { server, documentId } = await documentWithOwner();
  commitBootstrap({ services: server.services, documentId, userId: server.services.documents.ownerOf(documentId) as string });
  const notPublic = await getPublic({ server, documentId });
  const missing = await getPublic({ server, documentId: randomUUID() });
  const malformed = await getPublic({ server, documentId: 'not-a-document' });
  const answers = await Promise.all([notPublic, missing, malformed].map(async (response) => [response.status, await response.text()]));
  expect(answers[0]).toEqual([HttpStatus.NotFound, expect.any(String)]);
  expect(answers[1]).toEqual(answers[0]);
  expect(answers[2]).toEqual(answers[0]);
  await server.stop();
});

test('a document switched back to private answers not found', async () => {
  const { server, documentId } = await publicRoom();
  server.services.documents.setPublic({ documentId, isPublic: false });
  expect((await getPublic({ server, documentId })).status).toBe(HttpStatus.NotFound);
  await server.stop();
});

test('a signed-in person who is not a member keeps the real name and has no animal', async () => {
  const { server, documentId } = await publicRoom();
  const bruno = await signedInUser({ server, name: 'Bruno' });
  const body: PublicOpened = await (await getPublic({ server, documentId, cookie: bruno.cookie })).json();
  if (body.access !== PublicAccess.Visitor) throw new Error('A visitor was expected');
  expect([body.viewer.name, body.viewer.animal]).toEqual(['Bruno', null]);
  expect(JSON.stringify(body).includes(bruno.id)).toBe(false);
  await server.stop();
});

test('a member is told to use the document and gets no token, even while the document is private', async () => {
  const { server, documentId, owner } = await publicRoom();
  const whilePublic: PublicOpened = await (await getPublic({ server, documentId, cookie: owner.cookie })).json();
  server.services.documents.setPublic({ documentId, isPublic: false });
  const whilePrivate: PublicOpened = await (await getPublic({ server, documentId, cookie: owner.cookie })).json();
  expect([whilePublic, whilePrivate]).toEqual([{ access: PublicAccess.Member }, { access: PublicAccess.Member }]);
  await server.stop();
});

test('a room that is not committed answers 503 with Retry-After and spends no open budget', async () => {
  const { server, documentId } = await documentWithOwner();
  server.services.documents.setPublic({ documentId, isPublic: true });
  const roomModeFor = vi.spyOn(server.services.runtime, 'roomModeFor');
  const response = await getPublic({ server, documentId });
  expect(response.status).toBe(HttpStatus.ServiceUnavailable);
  expect(response.headers.get(RETRY_AFTER_HEADER)).not.toBeNull();
  expect(await response.json()).toEqual({ error: PUBLIC_PREPARING_MESSAGE });
  expect(roomModeFor).not.toHaveBeenCalled();
  expect(server.services.openBudget.trackedPairs()).toBe(0);
  await server.stop();
});

test('an address past the window is refused with Retry-After and another address is not', async () => {
  const { server, documentId } = await publicRoom();
  const allowed = await Promise.all(Array.from({ length: PUBLIC_READS_PER_MINUTE }, () => getPublic({ server, documentId })));
  const refused = await getPublic({ server, documentId });
  const otherAddress = await getPublic({ server, documentId, address: SECOND_ADDRESS });
  expect(allowed.every((response) => response.status === HttpStatus.Ok)).toBe(true);
  expect(refused.status).toBe(HttpStatus.TooManyRequests);
  expect(Number(refused.headers.get(RETRY_AFTER_HEADER))).toBeGreaterThan(0);
  expect(await refused.json()).toEqual({ error: PUBLIC_RATE_LIMITED_MESSAGE });
  expect(otherAddress.status).toBe(HttpStatus.Ok);
  await server.stop();
});
