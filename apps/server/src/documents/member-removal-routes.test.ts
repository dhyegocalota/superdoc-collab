import {
  ACCESS_REVOKED_CLOSE_CODE,
  ACCESS_REVOKED_REASON,
  documentApiPath,
  DocumentResource,
  DocumentRole,
  HttpMethod,
  HttpStatus,
  MEMBER_NOT_FOUND_MESSAGE,
  memberApiPath,
  OWNER_ACCESS_CANNOT_BE_REMOVED_MESSAGE,
  type DocumentMembers,
} from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { connectToDocument, documentWithOwner, memberWithRole } from '../testing/collaboration-client';
import { commitBootstrap as commitRoom } from '../testing/committed-room';
import { signedInUser, type TestServer } from '../testing/test-server';

const MEMBERS_RESOURCE = DocumentResource.Members;
const JSON_HEADERS = { 'content-type': 'application/json' };

function removeMember({ server, cookie, documentId, userId }: { server: TestServer; cookie: string; documentId: string; userId: string }) {
  return fetch(`${server.baseUrl}${memberApiPath({ documentId, userId })}`, {
    method: HttpMethod.Delete,
    headers: { cookie, ...JSON_HEADERS },
  });
}

function listMembers({ server, cookie, documentId }: { server: TestServer; cookie: string; documentId: string }) {
  return fetch(`${server.baseUrl}${documentApiPath({ documentId, resource: MEMBERS_RESOURCE })}`, { headers: { cookie } });
}

test('owner removes a reader', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  const removed = await removeMember({ server, cookie: owner.cookie, documentId, userId: reader.id });
  expect(removed.status).toBe(HttpStatus.NoContent);
  const { members }: DocumentMembers = await (await listMembers({ server, cookie: owner.cookie, documentId })).json();
  expect(members.map((member) => member.user.id)).toEqual([owner.id]);
  expect((await listMembers({ server, cookie: reader.cookie, documentId })).status).toBe(HttpStatus.NotFound);
  await server.stop();
});

test('removing a member closes that member socket with 4404 and leaves the owner connected', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  commitRoom({ services: server.services, documentId, userId: owner.id });
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId });
  const readerClient = await connectToDocument({ server, cookie: reader.cookie, documentId });
  const readerClose = { socket: null as { code: number; reason: string } | null };
  void readerClient.closed.then((closedSocket) => (readerClose.socket = closedSocket));
  await removeMember({ server, cookie: owner.cookie, documentId, userId: reader.id });
  await expect.poll(() => readerClose.socket).toEqual({ code: ACCESS_REVOKED_CLOSE_CODE, reason: ACCESS_REVOKED_REASON });
  expect(server.services.runtime.onlineUserIds(documentId).has(owner.id)).toBe(true);
  ownerClient.close();
  readerClient.close();
  await server.stop();
});

test('owner cannot remove themself', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const refused = await removeMember({ server, cookie: owner.cookie, documentId, userId: owner.id });
  expect([refused.status, await refused.json()]).toEqual([HttpStatus.BadRequest, { error: OWNER_ACCESS_CANNOT_BE_REMOVED_MESSAGE }]);
  expect(server.services.documents.findRole({ documentId, userId: owner.id })).toBe(DocumentRole.Owner);
  await server.stop();
});

test('unknown member answers 404', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const stranger = await signedInUser({ server, name: 'Stranger' });
  const missing = await removeMember({ server, cookie: owner.cookie, documentId, userId: stranger.id });
  expect([missing.status, await missing.json()]).toEqual([HttpStatus.NotFound, { error: MEMBER_NOT_FOUND_MESSAGE }]);
  await server.stop();
});

test('an editor cannot remove anyone', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const refused = await removeMember({ server, cookie: editor.cookie, documentId, userId: owner.id });
  expect(refused.status).toBe(HttpStatus.Forbidden);
  expect(server.services.documents.findRole({ documentId, userId: owner.id })).toBe(DocumentRole.Owner);
  await server.stop();
});

test('a stranger removing a member gets the same 404 as a missing document', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const stranger = await signedInUser({ server, name: 'Stranger' });
  const refused = await removeMember({ server, cookie: stranger.cookie, documentId, userId: owner.id });
  expect(refused.status).toBe(HttpStatus.NotFound);
  expect(server.services.documents.findRole({ documentId, userId: owner.id })).toBe(DocumentRole.Owner);
  await server.stop();
});
