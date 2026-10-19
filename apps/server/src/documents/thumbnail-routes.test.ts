import {
  DocumentResource,
  documentApiPath,
  DocumentRole,
  HttpMethod,
  HttpStatus,
  THUMBNAIL_MAX_BYTES,
  ThumbnailMimeType,
  type DocumentsList,
} from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { documentWithOwner, memberWithRole } from '../testing/collaboration-client';
import { signedInUser, type TestServer } from '../testing/test-server';

const WEBP_HEADER = [0x52, 0x49, 0x46, 0x46, 0x1a, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_BYTES = new Uint8Array([...WEBP_HEADER, 1, 2, 3, 4]);
const OTHER_WEBP_BYTES = new Uint8Array([...WEBP_HEADER, 9, 8, 7]);
const PNG_BYTES = new Uint8Array([...PNG_HEADER, 5, 6]);
const ENTITY_TAG_HEADER = 'etag';
const IF_NONE_MATCH_HEADER = 'if-none-match';
const CACHE_CONTROL_HEADER = 'cache-control';
const CONTENT_TYPE_HEADER = 'content-type';
const REVALIDATE_EVERY_TIME = 'private, max-age=0, must-revalidate';

function thumbnailPath(documentId: string): string {
  return documentApiPath({ documentId, resource: DocumentResource.Thumbnail });
}

function send({
  server,
  cookie,
  documentId,
  bytes,
  type = ThumbnailMimeType.WebP,
  method = HttpMethod.Put,
}: {
  server: TestServer;
  cookie: string;
  documentId: string;
  bytes: Uint8Array;
  type?: string;
  method?: HttpMethod;
}): Promise<Response> {
  return fetch(`${server.baseUrl}${thumbnailPath(documentId)}`, {
    method,
    headers: { cookie, origin: server.baseUrl, [CONTENT_TYPE_HEADER]: type },
    body: new Uint8Array(bytes),
  });
}

function read({
  server,
  cookie,
  documentId,
  headers = {},
}: {
  server: TestServer;
  cookie: string;
  documentId: string;
  headers?: Record<string, string>;
}): Promise<Response> {
  return fetch(`${server.baseUrl}${thumbnailPath(documentId)}`, { headers: { cookie, ...headers } });
}

async function thumbnailUpdatedAtOf({ server, cookie, documentId }: { server: TestServer; cookie: string; documentId: string }) {
  const list: DocumentsList = await (await fetch(`${server.baseUrl}/api/documents`, { headers: { cookie } })).json();
  return [...list.mine, ...list.shared].find((document) => document.id === documentId)!.thumbnailUpdatedAt;
}

test('the owner and an editor store a thumbnail and the list carries when', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  expect(await thumbnailUpdatedAtOf({ server, cookie: owner.cookie, documentId })).toBeNull();
  const byOwner = await send({ server, cookie: owner.cookie, documentId, bytes: WEBP_BYTES });
  expect(byOwner.status).toBe(HttpStatus.NoContent);
  expect(await thumbnailUpdatedAtOf({ server, cookie: owner.cookie, documentId })).toEqual(expect.any(Number));
  const byEditor = await send({ server, cookie: editor.cookie, documentId, bytes: OTHER_WEBP_BYTES });
  expect(byEditor.status).toBe(HttpStatus.NoContent);
  expect(new Uint8Array(await (await read({ server, cookie: owner.cookie, documentId })).arrayBuffer())).toEqual(OTHER_WEBP_BYTES);
  await server.stop();
});

test('a reader may read the thumbnail but not write it', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  await send({ server, cookie: owner.cookie, documentId, bytes: WEBP_BYTES });
  const refused = await send({ server, cookie: reader.cookie, documentId, bytes: OTHER_WEBP_BYTES });
  expect(refused.status).toBe(HttpStatus.Forbidden);
  const served = await read({ server, cookie: reader.cookie, documentId });
  expect(served.status).toBe(HttpStatus.Ok);
  expect(new Uint8Array(await served.arrayBuffer())).toEqual(WEBP_BYTES);
  await server.stop();
});

test('a non-member gets the same 404 as a missing document, writing or reading', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  await send({ server, cookie: owner.cookie, documentId, bytes: WEBP_BYTES });
  const stranger = await signedInUser({ server, name: 'Stranger' });
  const attempts = [
    (id: string) => send({ server, cookie: stranger.cookie, documentId: id, bytes: OTHER_WEBP_BYTES }),
    (id: string) => read({ server, cookie: stranger.cookie, documentId: id }),
  ];
  const outcomes = await Promise.all(
    attempts.map(async (attempt) => {
      const foreign = await attempt(documentId);
      const missing = await attempt(randomUUID());
      return { foreign: [foreign.status, await foreign.json()], missing: [missing.status, await missing.json()] };
    }),
  );
  outcomes.forEach(({ foreign, missing }) => expect(foreign).toEqual(missing));
  expect(outcomes.map(({ foreign }) => foreign[0])).toEqual([HttpStatus.NotFound, HttpStatus.NotFound]);
  expect(new Uint8Array(await (await read({ server, cookie: owner.cookie, documentId })).arrayBuffer())).toEqual(WEBP_BYTES);
  await server.stop();
});

test('a PNG is accepted and served as a PNG, and the beacon POST stores like the PUT', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const posted = await send({
    server,
    cookie: owner.cookie,
    documentId,
    bytes: PNG_BYTES,
    type: ThumbnailMimeType.Png,
    method: HttpMethod.Post,
  });
  expect(posted.status).toBe(HttpStatus.NoContent);
  const served = await read({ server, cookie: owner.cookie, documentId });
  expect(served.headers.get(CONTENT_TYPE_HEADER)).toBe(ThumbnailMimeType.Png);
  expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG_BYTES);
  await server.stop();
});

test.each([
  ['bytes that are not an image', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), ThumbnailMimeType.WebP],
  ['a PNG sent as WebP', PNG_BYTES, ThumbnailMimeType.WebP],
  ['a WebP sent as PNG', WEBP_BYTES, ThumbnailMimeType.Png],
  ['an image with a content type that is not an image', WEBP_BYTES, 'text/plain'],
  ['an empty body', new Uint8Array(), ThumbnailMimeType.WebP],
])('%s is refused with 415 and nothing is stored', async (_name, bytes, type) => {
  const { server, documentId, owner } = await documentWithOwner();
  const refused = await send({ server, cookie: owner.cookie, documentId, bytes, type });
  expect(refused.status).toBe(HttpStatus.UnsupportedMediaType);
  expect(await thumbnailUpdatedAtOf({ server, cookie: owner.cookie, documentId })).toBeNull();
  await server.stop();
});

test('a body above the size limit is refused with 413 and nothing is stored', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const oversized = new Uint8Array([...WEBP_HEADER, ...new Uint8Array(THUMBNAIL_MAX_BYTES)]);
  const refused = await send({ server, cookie: owner.cookie, documentId, bytes: oversized });
  expect(refused.status).toBe(HttpStatus.PayloadTooLarge);
  expect(await thumbnailUpdatedAtOf({ server, cookie: owner.cookie, documentId })).toBeNull();
  await server.stop();
});

test('a document without a thumbnail answers 404', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  expect((await read({ server, cookie: owner.cookie, documentId })).status).toBe(HttpStatus.NotFound);
  await server.stop();
});

test('the thumbnail carries an ETag and a revalidating cache policy, and a matching tag answers 304', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  await send({ server, cookie: owner.cookie, documentId, bytes: WEBP_BYTES });
  const first = await read({ server, cookie: owner.cookie, documentId });
  const entityTag = first.headers.get(ENTITY_TAG_HEADER)!;
  expect(entityTag).toBeTruthy();
  expect(first.headers.get(CACHE_CONTROL_HEADER)).toBe(REVALIDATE_EVERY_TIME);
  const unchanged = await read({ server, cookie: owner.cookie, documentId, headers: { [IF_NONE_MATCH_HEADER]: entityTag } });
  expect(unchanged.status).toBe(HttpStatus.NotModified);
  const stale = await read({ server, cookie: owner.cookie, documentId, headers: { [IF_NONE_MATCH_HEADER]: '"stale"' } });
  expect(stale.status).toBe(HttpStatus.Ok);
  await server.stop();
});

test('deleting the document removes its thumbnail file', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  await send({ server, cookie: owner.cookie, documentId, bytes: WEBP_BYTES });
  const deleted = await fetch(`${server.baseUrl}${documentApiPath({ documentId })}`, {
    method: HttpMethod.Delete,
    headers: { cookie: owner.cookie, origin: server.baseUrl },
  });
  expect(deleted.status).toBe(HttpStatus.NoContent);
  await expect(server.services.storage.readThumbnail(documentId)).rejects.toThrow();
  await server.stop();
});

test('a document deleted after the upload was authorized leaves no file', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const { documents, storage } = server.services;
  const putThumbnail = storage.putThumbnail.bind(storage);
  vi.spyOn(storage, 'putThumbnail').mockImplementation(async (input) => {
    documents.remove(documentId);
    await putThumbnail(input);
  });
  const refused = await send({ server, cookie: owner.cookie, documentId, bytes: WEBP_BYTES });
  expect(refused.status).toBe(HttpStatus.NotFound);
  await expect(storage.readThumbnail(documentId)).rejects.toThrow();
  vi.restoreAllMocks();
  await server.stop();
});
