import { DocumentResource, DocumentRole, HttpMethod, HttpStatus, type PublicFlag } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { documentWithOwner, memberWithRole } from '../testing/collaboration-client';
import { pathOf, request } from '../testing/documents-client';
import { signedInUser, type TestServer } from '../testing/test-server';

function publicPathOf(documentId: string): string {
  return pathOf({ documentId, resource: DocumentResource.Public });
}

function switchPublic({
  server,
  cookie,
  documentId,
  body,
}: {
  server: TestServer;
  cookie: string;
  documentId: string;
  body: unknown;
}): Promise<Response> {
  return request({ server, cookie, path: publicPathOf(documentId), method: HttpMethod.Put, body });
}

test('a new document is private and its flag is read and written per document', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const { documents } = server.services;
  const otherDocumentId = crypto.randomUUID();
  documents.create({ id: otherDocumentId, title: 'Other', ownerUserId: owner.id });
  expect(documents.isPublic(documentId)).toBe(false);
  documents.setPublic({ documentId, isPublic: true });
  expect([documents.isPublic(documentId), documents.isPublic(otherDocumentId)]).toEqual([true, false]);
  documents.setPublic({ documentId, isPublic: false });
  expect(documents.isPublic(documentId)).toBe(false);
  await server.stop();
});

test('an owner switches a document public and reads the flag back', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const switched = await switchPublic({ server, cookie: owner.cookie, documentId, body: { isPublic: true } });
  expect(switched.status).toBe(HttpStatus.Ok);
  expect(await switched.json()).toEqual({ isPublic: true } satisfies PublicFlag);
  const read = await request({ server, cookie: owner.cookie, path: publicPathOf(documentId) });
  expect(await read.json()).toEqual({ isPublic: true } satisfies PublicFlag);
  await server.stop();
});

test.each([
  { role: DocumentRole.Editor, status: HttpStatus.Forbidden },
  { role: DocumentRole.Reader, status: HttpStatus.Forbidden },
])('a $role cannot switch or read the public flag', async ({ role, status }) => {
  const { server, documentId } = await documentWithOwner();
  const member = await memberWithRole({ server, documentId, role });
  const switched = await switchPublic({ server, cookie: member.cookie, documentId, body: { isPublic: true } });
  const read = await request({ server, cookie: member.cookie, path: publicPathOf(documentId) });
  expect([switched.status, read.status]).toEqual([status, status]);
  expect(server.services.documents.isPublic(documentId)).toBe(false);
  await server.stop();
});

test('a stranger gets not found and a signed-out caller is refused', async () => {
  const { server, documentId } = await documentWithOwner();
  const stranger = await signedInUser({ server, name: 'Stranger' });
  const asStranger = await switchPublic({ server, cookie: stranger.cookie, documentId, body: { isPublic: true } });
  const signedOut = await switchPublic({ server, cookie: '', documentId, body: { isPublic: true } });
  expect([asStranger.status, signedOut.status]).toEqual([HttpStatus.NotFound, HttpStatus.Unauthorized]);
  await server.stop();
});

test.each([
  { name: 'a string', body: { isPublic: 'yes' } },
  { name: 'no field', body: {} },
  { name: 'no body', body: undefined },
])('a switch with $name is a bad request and the flag stays', async ({ body }) => {
  const { server, documentId, owner } = await documentWithOwner();
  const switched = await switchPublic({ server, cookie: owner.cookie, documentId, body });
  expect(switched.status).toBe(HttpStatus.BadRequest);
  expect(server.services.documents.isPublic(documentId)).toBe(false);
  await server.stop();
});
