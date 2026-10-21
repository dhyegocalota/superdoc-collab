import { ACCESS_REVOKED_CLOSE_CODE, ACCESS_REVOKED_REASON, DocumentResource, HttpMethod, HttpStatus } from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { CollaborationRefusedError, connectAsVisitor, connectToDocument } from '../testing/collaboration-client';
import { pathOf, request } from '../testing/documents-client';
import { publicRoom, roomConnections, visitorToken } from '../testing/public-room';
import type { TestServer, TestUser } from '../testing/test-server';

const REVOKED_CLOSING = { code: ACCESS_REVOKED_CLOSE_CODE, reason: ACCESS_REVOKED_REASON };

function switchPublic({
  server,
  owner,
  documentId,
  isPublic,
}: {
  server: TestServer;
  owner: TestUser;
  documentId: string;
  isPublic: boolean;
}): Promise<Response> {
  return request({
    server,
    cookie: owner.cookie,
    path: pathOf({ documentId, resource: DocumentResource.Public }),
    method: HttpMethod.Put,
    body: { isPublic },
  });
}

test('switching the document private closes every open public socket and leaves the members connected', async () => {
  const { server, documentId, owner } = await publicRoom();
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId, bootstrapToken: null });
  const token = await visitorToken({ server, documentId });
  const visitors = await Promise.all([connectAsVisitor({ server, token, documentId }), connectAsVisitor({ server, token, documentId })]);
  const switched = await switchPublic({ server, owner, documentId, isPublic: false });
  expect(switched.status).toBe(HttpStatus.Ok);
  const closings = await Promise.all(visitors.map((visitor) => visitor.closed));
  expect(closings).toEqual(visitors.map(() => REVOKED_CLOSING));
  expect(roomConnections({ server, documentId })).toHaveLength(1);
  await expect(connectAsVisitor({ server, token, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
  ownerClient.close();
  await server.stop();
});

test('switching a private document private again fails nothing', async () => {
  const { server, documentId, owner } = await publicRoom();
  server.services.documents.setPublic({ documentId, isPublic: false });
  const switched = await switchPublic({ server, owner, documentId, isPublic: false });
  expect(switched.status).toBe(HttpStatus.Ok);
  await server.stop();
});

test('a socket admitted just before the switch is closed with the revoked code before it syncs', async () => {
  const { server, documentId } = await publicRoom();
  const token = await visitorToken({ server, documentId });
  const { documents } = server.services;
  const readIsPublic = documents.isPublic.bind(documents);
  vi.spyOn(documents, 'isPublic').mockImplementationOnce(readIsPublic).mockReturnValue(false);
  await expect(connectAsVisitor({ server, token, documentId })).rejects.toMatchObject({ closeCode: ACCESS_REVOKED_CLOSE_CODE });
  await server.stop();
});
