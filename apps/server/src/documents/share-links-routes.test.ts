import {
  ApiPath,
  documentApiPath,
  DocumentResource,
  DocumentRole,
  HttpMethod,
  HttpStatus,
  INVALID_SHARE_LINK_MESSAGE,
  shareLinkAcceptPath,
  sharePagePath,
  ShareLinkRole,
  type DocumentSummary,
  type ShareLinks,
} from '@superdoc-history/types';
import { expect, test } from 'vitest';
import { ShareLinksRepository } from './share-links';
import { memberWithRole } from '../testing/collaboration-client';
import { signedInOwner, signedInUser, type TestServer } from '../testing/test-server';

const JSON_HEADERS = { 'content-type': 'application/json' };

async function blankDocumentWithOwner() {
  const { server, owner } = await signedInOwner();
  const created = await fetch(`${server.baseUrl}${ApiPath.Documents}`, { method: HttpMethod.Post, headers: { cookie: owner.cookie, ...JSON_HEADERS }, body: JSON.stringify({ title: 'Shared' }) });
  const { id: documentId }: DocumentSummary = await created.json();
  return { server, documentId, owner };
}

function shareLinksPath(documentId: string): string {
  return `${documentApiPath({ documentId })}/${DocumentResource.ShareLinks}`;
}

async function shareLinksOf({ server, cookie, documentId }: { server: TestServer; cookie: string; documentId: string }): Promise<ShareLinks> {
  return (await fetch(`${server.baseUrl}${shareLinksPath(documentId)}`, { headers: { cookie } })).json();
}

function rotate({ server, cookie, documentId, role }: { server: TestServer; cookie: string; documentId: string; role: string }): Promise<Response> {
  return fetch(`${server.baseUrl}${shareLinksPath(documentId)}/${role}/rotate`, { method: HttpMethod.Post, headers: { cookie } });
}

function accept({ server, cookie, url }: { server: TestServer; cookie: string; url: string }): Promise<Response> {
  const token = new URL(url).pathname.split('/').at(-1) as string;
  return fetch(`${server.baseUrl}${shareLinkAcceptPath(token)}`, { method: HttpMethod.Post, headers: { cookie } });
}

test('rotation invalidates the link but keeps recorded roles', async () => {
  const { server, documentId, owner } = await blankDocumentWithOwner();
  const bruno = await signedInUser({ server, name: 'Bruno' });
  const caio = await signedInUser({ server, name: 'Caio' });
  const before = await shareLinksOf({ server, cookie: owner.cookie, documentId });
  expect((await accept({ server, cookie: bruno.cookie, url: before[ShareLinkRole.Edit] })).status).toBe(HttpStatus.Ok);
  await rotate({ server, cookie: owner.cookie, documentId, role: ShareLinkRole.Edit });
  expect((await accept({ server, cookie: caio.cookie, url: before[ShareLinkRole.Edit] })).status).toBe(HttpStatus.NotFound);
  await accept({ server, cookie: bruno.cookie, url: before[ShareLinkRole.Read] });
  expect(server.services.documents.findRole({ documentId, userId: bruno.id })).toBe(DocumentRole.Editor);
  await server.stop();
});

test('a token for a deleted document is no longer valid', async () => {
  const { server, documentId, owner } = await blankDocumentWithOwner();
  const bruno = await signedInUser({ server, name: 'Bruno' });
  const links = await shareLinksOf({ server, cookie: owner.cookie, documentId });
  await fetch(`${server.baseUrl}${documentApiPath({ documentId })}`, { method: HttpMethod.Delete, headers: { cookie: owner.cookie } });
  const response = await accept({ server, cookie: bruno.cookie, url: links[ShareLinkRole.Read] });
  expect([response.status, await response.json()]).toEqual([HttpStatus.NotFound, { error: INVALID_SHARE_LINK_MESSAGE }]);
  await server.stop();
});

test('a reader who accepts the edit link becomes an editor', async () => {
  const { server, documentId, owner } = await blankDocumentWithOwner();
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  const links = await shareLinksOf({ server, cookie: owner.cookie, documentId });
  await accept({ server, cookie: reader.cookie, url: links[ShareLinkRole.Edit] });
  expect(server.services.documents.findRole({ documentId, userId: reader.id })).toBe(DocumentRole.Editor);
  await server.stop();
});

test('the owner accepting their own link stays owner', async () => {
  const { server, documentId, owner } = await blankDocumentWithOwner();
  const links = await shareLinksOf({ server, cookie: owner.cookie, documentId });
  const statuses = await Promise.all([links[ShareLinkRole.Edit], links[ShareLinkRole.Read]].map(async (url) => (await accept({ server, cookie: owner.cookie, url })).status));
  expect(statuses).toEqual([HttpStatus.Ok, HttpStatus.Ok]);
  expect(server.services.documents.findRole({ documentId, userId: owner.id })).toBe(DocumentRole.Owner);
  await server.stop();
});

test('the same links come back on every GET until rotated', async () => {
  const { server, documentId, owner } = await blankDocumentWithOwner();
  const first = await shareLinksOf({ server, cookie: owner.cookie, documentId });
  expect(await shareLinksOf({ server, cookie: owner.cookie, documentId })).toEqual(first);
  await server.stop();
});

test('rotating the edit link leaves the read URL unchanged', async () => {
  const { server, documentId, owner } = await blankDocumentWithOwner();
  const before = await shareLinksOf({ server, cookie: owner.cookie, documentId });
  const rotated: ShareLinks = await (await rotate({ server, cookie: owner.cookie, documentId, role: ShareLinkRole.Edit })).json();
  expect(rotated[ShareLinkRole.Edit]).not.toBe(before[ShareLinkRole.Edit]);
  expect(rotated[ShareLinkRole.Read]).toBe(before[ShareLinkRole.Read]);
  expect(await shareLinksOf({ server, cookie: owner.cookie, documentId })).toEqual(rotated);
  await server.stop();
});

test('rotating with role owner is 400', async () => {
  const { server, documentId, owner } = await blankDocumentWithOwner();
  const before = await shareLinksOf({ server, cookie: owner.cookie, documentId });
  expect((await rotate({ server, cookie: owner.cookie, documentId, role: DocumentRole.Owner })).status).toBe(HttpStatus.BadRequest);
  expect(await shareLinksOf({ server, cookie: owner.cookie, documentId })).toEqual(before);
  await server.stop();
});

test('share-links is 404 for a non-member and 403 for an editor', async () => {
  const { server, documentId } = await blankDocumentWithOwner();
  const stranger = await signedInUser({ server, name: 'Stranger' });
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const strangerResponse = await fetch(`${server.baseUrl}${shareLinksPath(documentId)}`, { headers: { cookie: stranger.cookie } });
  const editorResponse = await fetch(`${server.baseUrl}${shareLinksPath(documentId)}`, { headers: { cookie: editor.cookie } });
  expect([strangerResponse.status, editorResponse.status]).toEqual([HttpStatus.NotFound, HttpStatus.Forbidden]);
  await server.stop();
});

test('accept without a session is 401', async () => {
  const { server, documentId, owner } = await blankDocumentWithOwner();
  const links = await shareLinksOf({ server, cookie: owner.cookie, documentId });
  expect((await accept({ server, cookie: '', url: links[ShareLinkRole.Read] })).status).toBe(HttpStatus.Unauthorized);
  await server.stop();
});

test('an unknown token is the generic invalid-link 404', async () => {
  const { server, owner } = await blankDocumentWithOwner();
  const response = await accept({ server, cookie: owner.cookie, url: `${server.baseUrl}/share/not-a-real-token` });
  expect([response.status, await response.json()]).toEqual([HttpStatus.NotFound, { error: INVALID_SHARE_LINK_MESSAGE }]);
  await server.stop();
});

test('rotating as an editor is 403', async () => {
  const { server, documentId, owner } = await blankDocumentWithOwner();
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const before = await shareLinksOf({ server, cookie: owner.cookie, documentId });
  expect((await rotate({ server, cookie: editor.cookie, documentId, role: ShareLinkRole.Edit })).status).toBe(HttpStatus.Forbidden);
  expect(await shareLinksOf({ server, cookie: owner.cookie, documentId })).toEqual(before);
  await server.stop();
});

test('links stored under another secret are regenerated and work', async () => {
  const { server, documentId } = await blankDocumentWithOwner();
  const options = { database: server.database, appOrigin: server.baseUrl };
  const oldLinks = new ShareLinksRepository({ ...options, secret: 'the-previous-secret-of-the-server' }).links(documentId);
  const current = new ShareLinksRepository({ ...options, secret: 'the-current-secret-of-the-server!' });
  const newLinks = current.links(documentId);
  const tokenOf = (url: string) => new URL(url).pathname.split('/').at(-1) as string;
  expect(newLinks[ShareLinkRole.Edit]).not.toBe(oldLinks[ShareLinkRole.Edit]);
  expect(current.resolve(tokenOf(newLinks[ShareLinkRole.Edit]))).toEqual({ documentId, role: ShareLinkRole.Edit });
  expect(current.resolve(tokenOf(oldLinks[ShareLinkRole.Edit]))).toBeNull();
  await server.stop();
});

test('the share page path is built from the token', () => {
  expect(sharePagePath('a b')).toBe('/share/a%20b');
});
