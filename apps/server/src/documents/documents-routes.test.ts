import { buildSeedDocx, declaredDocumentXmlBytes, isDocx, TrackedChangeKind } from '@superdoc-collab/history';
import { commitBootstrap, writeStory } from '@superdoc-collab/history/testing';
import {
  ApiPath,
  BOOTSTRAP_QUEUE_RETRY_AFTER_MS,
  bootstrapMemoryShortMessage,
  largestPreparableMegabytes,
  BOOTSTRAP_MS_PER_MEGABYTE,
  BOOTSTRAP_STATE_BYTES_RATIO,
  BYTES_PER_MEGABYTE,
  DOCUMENT_TOO_LARGE_MESSAGE,
  MAX_DOCUMENT_XML_BYTES,
  UPLOADS_PER_MINUTE,
  BootstrapStage,
  ClientActor,
  DOCX_MIME_TYPE,
  DocumentResource,
  DocumentRole,
  HttpMethod,
  HttpStatus,
  MAX_UPLOAD_BYTES,
  OPEN_UNCOMMITTED_PER_MINUTE,
  RETRY_AFTER_HEADER,
  TITLE_MAX_LENGTH,
  RoomMode,
  AUTHOR_COLOR_SLOT_COUNT,
  authorColorSlot,
  UPLOAD_FIELD,
  type DocumentMembers,
  type DocumentsList,
  type DocumentSummary,
  type OpenedDocument,
} from '@superdoc-collab/types';
import JSZip from 'jszip';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import * as Y from 'yjs';
import { connectToDocument, documentWithOwner, memberWithRole, beginOwnerBootstrap } from '../testing/collaboration-client';
import { commitBootstrap as commitRoom } from '../testing/committed-room';
import { openedBy, pathOf, request } from '../testing/documents-client';
import { readEvents } from '../testing/events-client';
import { signedInOwner, signedInUser, TEST_AUTH_SECRET, type TestServer, type TestUser } from '../testing/test-server';
import { verifyBootstrapToken } from '../agent/room-tokens';
import { COMMITTED_WITHOUT_BOOTSTRAP } from '../collaboration/room-bootstrap';
import { DOCUMENT_FILES_DIRECTORY } from '../database/connection';
import { ROOM_MODE_SCAN_BATCH_SIZE } from '../collaboration/collaboration-runtime';

const IMPORT_TIMEOUT_MS = 30_000;
const TWELVE_MEGABYTES = 12 * BYTES_PER_MEGABYTE;
const FOUR_GIGABYTES = 4096;
const HEAVY_XML_BYTES = 9.5 * BYTES_PER_MEGABYTE;
const LIGHT_XML_BYTES = 2 * BYTES_PER_MEGABYTE;
const STREAMED_CHUNK_COUNT = 12;
const FORBIDDEN_TITLE_FILE_NAME = `Q3 "final" (draft)'s plan*`;
const RENAME_BODY_OVER_LIMIT_CHARACTERS = 5000;
const LONG_LOG_EXTRA_UPDATES = 20;
const JSON_HEADERS = { 'content-type': 'application/json' };

async function upload({
  server,
  cookie,
  bytes,
  type = DOCX_MIME_TYPE,
  fileName = 'Plan.docx',
}: {
  server: TestServer;
  cookie: string;
  bytes: Uint8Array;
  type?: string;
  fileName?: string;
}): Promise<Response> {
  const form = new FormData();
  form.set(UPLOAD_FIELD, new File([new Uint8Array(bytes)], fileName, { type }));
  return fetch(`${server.baseUrl}${ApiPath.Documents}`, {
    method: HttpMethod.Post,
    headers: { cookie, origin: server.baseUrl },
    body: form,
  });
}

async function listOf({ server, cookie }: { server: TestServer; cookie: string }): Promise<DocumentsList> {
  return (await fetch(`${server.baseUrl}${ApiPath.Documents}`, { headers: { cookie } })).json();
}

async function createBlank({ server, cookie, title }: { server: TestServer; cookie: string; title: string }): Promise<Response> {
  return fetch(`${server.baseUrl}${ApiPath.Documents}`, {
    method: HttpMethod.Post,
    headers: { cookie, ...JSON_HEADERS },
    body: JSON.stringify({ title }),
  });
}

async function docxWithXmlBytes(xmlBytes: number): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('word/document.xml', new Uint8Array(xmlBytes), { compression: 'DEFLATE' });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

async function docxBytes(text: string): Promise<Buffer> {
  return buildSeedDocx([{ text, trackedChanges: [] }]);
}

test('rejects a zip without word/document.xml', async () => {
  const { server, owner } = await signedInOwner();
  const zip = new JSZip();
  zip.file('notes.txt', 'renamed zip');
  expect((await upload({ server, cookie: owner.cookie, bytes: await zip.generateAsync({ type: 'uint8array' }) })).status).toBe(
    HttpStatus.UnsupportedMediaType,
  );
  expect((await listOf({ server, cookie: owner.cookie })).mine).toEqual([]);
  expect(readdirSync(join(server.databaseDirectory, DOCUMENT_FILES_DIRECTORY), { withFileTypes: true }).length).toBe(0);
  await server.stop();
});

test('a zip whose document.xml inflates over the limit is 415 with its own message and is not stored', async () => {
  const { server, owner } = await signedInOwner();
  const zip = new JSZip();
  zip.file('word/document.xml', new Uint8Array(MAX_DOCUMENT_XML_BYTES + 1), { compression: 'DEFLATE' });
  const response = await upload({
    server,
    cookie: owner.cookie,
    bytes: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }),
  });
  expect([response.status, await response.json()]).toEqual([HttpStatus.UnsupportedMediaType, { error: DOCUMENT_TOO_LARGE_MESSAGE }]);
  expect((await listOf({ server, cookie: owner.cookie })).mine).toEqual([]);
  expect(readdirSync(join(server.databaseDirectory, DOCUMENT_FILES_DIRECTORY), { withFileTypes: true }).length).toBe(0);
  await server.stop();
});

test('a user over the uploads of the minute is 429 with Retry-After, creates nothing, and another user is still served', async () => {
  const { server, owner } = await signedInOwner();
  const other = await signedInUser({ server, name: 'Bruno' });
  vi.spyOn(server.services.runtime, 'bootstrapRoom').mockImplementation(() => COMMITTED_WITHOUT_BOOTSTRAP);
  const bytes = await docxBytes('Plan');
  const accepted = await Promise.all(Array.from({ length: UPLOADS_PER_MINUTE }, () => upload({ server, cookie: owner.cookie, bytes })));
  expect(new Set(accepted.map((response) => response.status))).toEqual(new Set([HttpStatus.Created]));
  const refusedUpload = await upload({ server, cookie: owner.cookie, bytes });
  const refusedBlank = await createBlank({ server, cookie: owner.cookie, title: 'Blank' });
  expect([refusedUpload.status, refusedBlank.status]).toEqual([HttpStatus.TooManyRequests, HttpStatus.TooManyRequests]);
  expect(Number(refusedUpload.headers.get(RETRY_AFTER_HEADER))).toBeGreaterThan(0);
  expect((await listOf({ server, cookie: owner.cookie })).mine).toHaveLength(UPLOADS_PER_MINUTE);
  expect((await upload({ server, cookie: other.cookie, bytes })).status).toBe(HttpStatus.Created);
  await server.stop();
});

test('a second upload of one owner while one waits in the queue is 429 with Retry-After and creates nothing', async () => {
  const { server, owner } = await signedInOwner();
  const other = await signedInUser({ server, name: 'Bruno' });
  vi.spyOn(server.services.scheduler, 'bootstrap').mockReturnValue(new Promise(() => undefined));
  const bytes = await docxBytes('Plan');
  const running = await upload({ server, cookie: owner.cookie, bytes });
  const queued = await upload({ server, cookie: owner.cookie, bytes });
  const refused = await upload({ server, cookie: owner.cookie, bytes });
  const refusedBlank = await createBlank({ server, cookie: owner.cookie, title: 'Blank' });
  expect([running.status, queued.status, refused.status, refusedBlank.status]).toEqual([
    HttpStatus.Created,
    HttpStatus.Created,
    HttpStatus.TooManyRequests,
    HttpStatus.TooManyRequests,
  ]);
  expect(Number(refused.headers.get(RETRY_AFTER_HEADER))).toBe(BOOTSTRAP_QUEUE_RETRY_AFTER_MS / 1000);
  expect((await listOf({ server, cookie: owner.cookie })).mine).toHaveLength(2);
  expect((await upload({ server, cookie: other.cookie, bytes })).status).toBe(HttpStatus.Created);
  await server.stop();
});

test('two uploads of the same file create two documents', async () => {
  const { server, owner } = await signedInOwner();
  const other = await signedInUser({ server, name: 'Bruno' });
  const bytes = await docxBytes('Same');
  const first: DocumentSummary = await (await upload({ server, cookie: owner.cookie, bytes })).json();
  const second: DocumentSummary = await (await upload({ server, cookie: other.cookie, bytes })).json();
  expect(first.id).not.toBe(second.id);
  expect((await listOf({ server, cookie: other.cookie })).mine.map((document) => document.id)).toEqual([second.id]);
  await server.stop();
});

test('imported Word revisions appear in the events with the revision author', { timeout: IMPORT_TIMEOUT_MS + 10_000 }, async () => {
  const { server, owner } = await signedInOwner();
  const bytes = await buildSeedDocx([
    {
      text: 'Preamble by',
      trackedChanges: [{ kind: TrackedChangeKind.Insert, author: 'Chris Crawford', date: '2026-02-12T09:01:00Z', text: ' developers' }],
    },
  ]);
  const created: DocumentSummary = await (await upload({ server, cookie: owner.cookie, bytes })).json();
  await expect
    .poll(
      async () =>
        (await readEvents({ server, cookie: owner.cookie, documentId: created.id })).map((event) => [
          event.imported,
          event.authors,
          event.inserted,
        ]),
      { timeout: IMPORT_TIMEOUT_MS },
    )
    .toEqual([[true, [{ id: null, name: 'Chris Crawford', actor: ClientActor.Human }], ' developers']]);
  await server.stop();
});

test('an uploaded document is listed as mine and downloads the original bytes', async () => {
  const { server, owner } = await signedInOwner();
  const bytes = await docxBytes('Original');
  const created: DocumentSummary = await (await upload({ server, cookie: owner.cookie, bytes })).json();
  expect(created.title).toBe('Plan');
  expect((await listOf({ server, cookie: owner.cookie })).mine.map((document) => document.id)).toEqual([created.id]);
  server.services.readModel.commit({ documentName: created.id, events: [], marks: [], lastSequence: 1, preview: 'Hello preview' });
  expect((await listOf({ server, cookie: owner.cookie })).mine.map((document) => document.preview)).toEqual(['Hello preview']);
  const downloaded = await request({
    server,
    cookie: owner.cookie,
    path: pathOf({ documentId: created.id, resource: DocumentResource.Download }),
  });
  expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(new Uint8Array(bytes));
  await server.stop();
});

test('a body over the limit is 413 before parsing', async () => {
  const { server, owner } = await signedInOwner();
  const response = await upload({ server, cookie: owner.cookie, bytes: new Uint8Array(TWELVE_MEGABYTES) });
  expect(response.status).toBe(HttpStatus.PayloadTooLarge);
  expect(readdirSync(join(server.databaseDirectory, DOCUMENT_FILES_DIRECTORY)).length).toBe(0);
  await server.stop();
});

test('a file of exactly 10 MB is not refused for its size', async () => {
  const { server, owner } = await signedInOwner();
  const response = await upload({ server, cookie: owner.cookie, bytes: new Uint8Array(MAX_UPLOAD_BYTES) });
  expect(response.status).toBe(HttpStatus.UnsupportedMediaType);
  await server.stop();
});

test('a document too large for the memory of the server to prepare is 413 with the largest size, however small its file, and is not stored', async () => {
  const { server, owner } = await signedInOwner({ memoryLimitMegabytes: FOUR_GIGABYTES });
  const bytes = await docxWithXmlBytes(HEAVY_XML_BYTES);
  expect(bytes.byteLength).toBeLessThan(BYTES_PER_MEGABYTE);
  const response = await upload({ server, cookie: owner.cookie, bytes });
  expect([response.status, await response.json()]).toEqual([
    HttpStatus.PayloadTooLarge,
    { error: bootstrapMemoryShortMessage(largestPreparableMegabytes(FOUR_GIGABYTES)) },
  ]);
  expect(readdirSync(join(server.databaseDirectory, DOCUMENT_FILES_DIRECTORY)).length).toBe(0);
  await server.stop();
});

test('a document the memory of the server can prepare passes the guard and a blank create is never refused by it', async () => {
  const { server, owner } = await signedInOwner({ memoryLimitMegabytes: FOUR_GIGABYTES });
  vi.spyOn(server.services.runtime, 'bootstrapRoom').mockImplementation(() => COMMITTED_WITHOUT_BOOTSTRAP);
  const light = await upload({ server, cookie: owner.cookie, bytes: await docxWithXmlBytes(LIGHT_XML_BYTES) });
  const blank = await createBlank({ server, cookie: owner.cookie, title: 'Blank' });
  expect([light.status, blank.status]).toEqual([HttpStatus.Created, HttpStatus.Created]);
  await server.stop();
});

test('an unknown memory limit never refuses a document for its memory', async () => {
  const { server, owner } = await signedInOwner();
  vi.spyOn(server.services.runtime, 'bootstrapRoom').mockImplementation(() => COMMITTED_WITHOUT_BOOTSTRAP);
  const response = await upload({ server, cookie: owner.cookie, bytes: await docxWithXmlBytes(HEAVY_XML_BYTES) });
  expect(response.status).toBe(HttpStatus.Created);
  await server.stop();
});

test('a deflated heavy document waits in the heavy lane by its XML, and a light one of the same owner is not held behind it', async () => {
  const { server, owner } = await signedInOwner();
  vi.spyOn(server.services.scheduler, 'bootstrap').mockReturnValue(new Promise(() => undefined));
  const heavy = await docxWithXmlBytes(HEAVY_XML_BYTES);
  const running = await upload({ server, cookie: owner.cookie, bytes: heavy });
  const queued = await upload({ server, cookie: owner.cookie, bytes: heavy });
  const refused = await upload({ server, cookie: owner.cookie, bytes: heavy });
  const light = await upload({ server, cookie: owner.cookie, bytes: await docxBytes('Light') });
  expect([running.status, queued.status, refused.status, light.status]).toEqual([
    HttpStatus.Created,
    HttpStatus.Created,
    HttpStatus.TooManyRequests,
    HttpStatus.Created,
  ]);
  await server.stop();
});

test('a file without the DOCX mime is 415', async () => {
  const { server, owner } = await signedInOwner();
  const response = await upload({ server, cookie: owner.cookie, bytes: await docxBytes('Valid'), type: 'text/plain' });
  expect(response.status).toBe(HttpStatus.UnsupportedMediaType);
  await server.stop();
});

test('a non-member gets the same 404 as a missing document', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const stranger = await signedInUser({ server, name: 'Stranger' });
  const attempts = [
    { method: HttpMethod.Get, resource: undefined, body: undefined },
    { method: HttpMethod.Patch, resource: undefined, body: { title: 'Hijacked' } },
    { method: HttpMethod.Delete, resource: undefined, body: undefined },
    { method: HttpMethod.Get, resource: DocumentResource.Download, body: undefined },
    { method: HttpMethod.Get, resource: DocumentResource.Members, body: undefined },
    { method: HttpMethod.Get, resource: DocumentResource.Events, body: undefined },
  ];
  const outcomes = await Promise.all(
    attempts.map(async ({ method, resource, body }) => {
      const foreign = await request({ server, cookie: stranger.cookie, path: pathOf({ documentId, resource }), method, body });
      const missing = await request({
        server,
        cookie: stranger.cookie,
        path: pathOf({ documentId: randomUUID(), resource }),
        method,
        body,
      });
      return { foreign: [foreign.status, await foreign.json()], missing: [missing.status, await missing.json()] };
    }),
  );
  outcomes.forEach(({ foreign, missing }) => expect(foreign).toEqual(missing));
  expect(outcomes.map(({ foreign }) => foreign[0])).toEqual(attempts.map(() => HttpStatus.NotFound));
  expect(server.services.documents.findRole({ documentId, userId: owner.id })).toBe(DocumentRole.Owner);
  await server.stop();
});

test('rename by an editor works and a reader gets 403', async () => {
  const { server, documentId } = await documentWithOwner();
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  const renamed = await request({
    server,
    cookie: editor.cookie,
    path: pathOf({ documentId }),
    method: HttpMethod.Patch,
    body: { title: '  New  ' },
  });
  expect(renamed.status).toBe(HttpStatus.Ok);
  expect(server.services.documents.summary({ documentId, userId: editor.id }).title).toBe('New');
  const refused = await request({
    server,
    cookie: reader.cookie,
    path: pathOf({ documentId }),
    method: HttpMethod.Patch,
    body: { title: 'Nope' },
  });
  expect(refused.status).toBe(HttpStatus.Forbidden);
  await server.stop();
});

test('a blank or whitespace title is refused', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const statuses = await Promise.all(
    ['', '   '].map(
      async (title) =>
        (await request({ server, cookie: owner.cookie, path: pathOf({ documentId }), method: HttpMethod.Patch, body: { title } })).status,
    ),
  );
  expect(statuses).toEqual([HttpStatus.BadRequest, HttpStatus.BadRequest]);
  expect(server.services.documents.summary({ documentId, userId: owner.id }).title).toBe('Shared plan');
  await server.stop();
});

test('a rename body over the limit is 413', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const response = await request({
    server,
    cookie: owner.cookie,
    path: pathOf({ documentId }),
    method: HttpMethod.Patch,
    body: { title: 'x'.repeat(RENAME_BODY_OVER_LIMIT_CHARACTERS) },
  });
  expect(response.status).toBe(HttpStatus.PayloadTooLarge);
  expect(server.services.documents.summary({ documentId, userId: owner.id }).title).toBe('Shared plan');
  await server.stop();
});

test('roomMode stays create until the bootstrap commits', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: ['Hello'] });
  await expect.poll(() => server.services.updateLog.hasUpdates(documentId)).toBe(true);
  const roomModeOf = () => server.services.runtime.roomMode(documentId);
  expect(roomModeOf()).toBe(RoomMode.Create);
  commitBootstrap(client.document);
  await expect.poll(roomModeOf).toBe(RoomMode.Join);
  client.close();
  await server.stop();
});

test('roomMode scans a long log in pages until the first committed bootstrap', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const document = new Y.Doc();
  document.on('update', (update: Uint8Array) =>
    server.services.updateLog.append({ documentName: documentId, connectionUserId: owner.id, connectionActor: ClientActor.Human, update }),
  );
  Array.from({ length: ROOM_MODE_SCAN_BATCH_SIZE + LONG_LOG_EXTRA_UPDATES }).forEach((_, index) =>
    writeStory({ document, texts: ['x'.repeat(index + 1)] }),
  );
  commitBootstrap(document);
  server.services.roomBootstrap.forget(documentId);
  const readAll = vi.spyOn(server.services.updateLog, 'read');
  const readBatch = vi.spyOn(server.services.updateLog, 'readBatch');
  expect((await openedBy({ server, user: owner, documentId })).roomMode).toBe(RoomMode.Join);
  expect(readAll).not.toHaveBeenCalled();
  expect(readBatch.mock.calls.length).toBeGreaterThan(1);
  await server.stop();
});

test('every member opening an uncommitted document gets Join and the bootstrap in progress', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const answers = await Promise.all([owner, reader, editor].map((user) => openedBy({ server, user, documentId })));
  expect(answers.map(({ roomMode, bootstrap }) => [roomMode, bootstrap.stage])).toEqual([
    [RoomMode.Join, BootstrapStage.Preparing],
    [RoomMode.Join, BootstrapStage.Preparing],
    [RoomMode.Join, BootstrapStage.Preparing],
  ]);
  expect(answers[0]!.colorSlot).toBe(authorColorSlot(owner.id));
  await server.stop();
});

test('the open answer turns ready with the size of the state once the bootstrap commits', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: ['Hello'] });
  commitBootstrap(client.document);
  await expect.poll(async () => (await openedBy({ server, user: owner, documentId })).bootstrap.stage).toBe(BootstrapStage.Ready);
  const { bootstrap } = await openedBy({ server, user: owner, documentId });
  expect(bootstrap.stateBytes).toBeGreaterThan(0);
  client.close();
  await server.stop();
});

test('opening an uncommitted document nobody bootstrapped starts one bootstrap as the owner and never a second', async () => {
  const { server, owner } = await signedInOwner();
  const documentId = randomUUID();
  server.services.documents.create({ id: documentId, title: 'Budget', ownerUserId: owner.id });
  const bytes = await docxBytes('Budget');
  const documentXmlBytes = declaredDocumentXmlBytes(bytes);
  await server.services.storage.put({ documentId, bytes });
  const bootstrap = vi.spyOn(server.services.scheduler, 'bootstrap').mockReturnValue(new Promise(() => undefined));
  const first = await openedBy({ server, user: owner, documentId });
  await expect.poll(() => bootstrap.mock.calls.length).toBe(1);
  await openedBy({ server, user: owner, documentId });
  expect(bootstrap).toHaveBeenCalledTimes(1);
  const [request] = bootstrap.mock.calls[0]!;
  expect(first.bootstrap).toMatchObject({
    stage: BootstrapStage.Queued,
    done: 0,
    total: documentXmlBytes * BOOTSTRAP_STATE_BYTES_RATIO,
    estimatedMs: (documentXmlBytes / BYTES_PER_MEGABYTE) * BOOTSTRAP_MS_PER_MEGABYTE,
  });
  expect(request).toMatchObject({ documentId, filePath: server.services.storage.pathOf(documentId), documentXmlBytes });
  expect(request.url).toMatch(new RegExp(`${ApiPath.BootstrapCollaboration}$`));
  expect(verifyBootstrapToken({ secret: TEST_AUTH_SECRET, token: request.token, documentId, now: Date.now() })?.userId).toBe(owner.id);
  await server.stop();
});

test('an upload and a blank create each start a bootstrap for the new document', async () => {
  const { server, owner } = await signedInOwner();
  const bootstrap = vi.spyOn(server.services.runtime, 'bootstrapRoom').mockImplementation(() => COMMITTED_WITHOUT_BOOTSTRAP);
  const blankBootstrap = vi.spyOn(server.services.runtime, 'bootstrapBlankRoom').mockImplementation(() => COMMITTED_WITHOUT_BOOTSTRAP);
  const uploaded: DocumentSummary = await (await upload({ server, cookie: owner.cookie, bytes: await docxBytes('Plan') })).json();
  const blank: DocumentSummary = await (await createBlank({ server, cookie: owner.cookie, title: 'Blank' })).json();
  expect(bootstrap.mock.calls.map(([documentId]) => documentId)).toEqual([uploaded.id]);
  expect(blankBootstrap.mock.calls.map(([documentId]) => documentId)).toEqual([blank.id]);
  await server.stop();
});

test(
  'an uploaded document is bootstrapped by the server: ready, joined by the owner as a person, with the text',
  { timeout: IMPORT_TIMEOUT_MS + 10_000 },
  async () => {
    const { server, owner } = await signedInOwner();
    const created: DocumentSummary = await (await upload({ server, cookie: owner.cookie, bytes: await docxBytes('Server made') })).json();
    await expect
      .poll(async () => (await openedBy({ server, user: owner, documentId: created.id })).bootstrap.stage, { timeout: IMPORT_TIMEOUT_MS })
      .toBe(BootstrapStage.Ready);
    const opened = await openedBy({ server, user: owner, documentId: created.id });
    expect(opened.roomMode).toBe(RoomMode.Join);
    expect(opened.bootstrap.done).toBe(opened.bootstrap.total);
    const [committed] = server.services.updateLog.read({ documentName: created.id, untilSequence: Number.MAX_SAFE_INTEGER });
    expect(committed).toMatchObject({ connectionUserId: owner.id, connectionActor: ClientActor.Human });
    const joiner = await connectToDocument({ server, cookie: owner.cookie, documentId: created.id, bootstrapToken: null });
    expect(joiner.document.getMap('content').size).toBeGreaterThan(0);
    joiner.close();
    await server.stop();
  },
);

async function uncommittedDocuments({ server, owner, count }: { server: TestServer; owner: TestUser; count: number }): Promise<string[]> {
  vi.spyOn(server.services.scheduler, 'bootstrap').mockReturnValue(new Promise(() => undefined));
  const bytes = await docxBytes('Budget');
  return Promise.all(
    Array.from({ length: count }, async () => {
      const documentId = randomUUID();
      server.services.documents.create({ id: documentId, title: 'Budget', ownerUserId: owner.id });
      await server.services.storage.put({ documentId, bytes });
      return documentId;
    }),
  );
}

test('the first distinct uncommitted document over the budget answers 429 and another user is still served', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const others = await uncommittedDocuments({ server, owner, count: OPEN_UNCOMMITTED_PER_MINUTE + 1 });
  const statuses = await Promise.all(
    [documentId, ...others].map((openedId) => request({ server, cookie: owner.cookie, path: pathOf({ documentId: openedId }) })),
  );
  const limited = statuses.filter((response) => response.status === HttpStatus.TooManyRequests);
  expect([limited.length, statuses.filter((response) => response.status === HttpStatus.Ok).length]).toEqual([
    1,
    OPEN_UNCOMMITTED_PER_MINUTE + 1,
  ]);
  expect(Number(limited[0]!.headers.get(RETRY_AFTER_HEADER))).toBeGreaterThan(0);
  const other = await request({ server, cookie: editor.cookie, path: pathOf({ documentId }) });
  expect(other.status).toBe(HttpStatus.Ok);
  await server.stop();
});

test('the first distinct uncommitted document over the budget makes no query to the log', async () => {
  const { server, owner } = await documentWithOwner();
  const opened = await uncommittedDocuments({ server, owner, count: OPEN_UNCOMMITTED_PER_MINUTE + 1 });
  await Promise.all(opened.slice(0, -1).map((documentId) => request({ server, cookie: owner.cookie, path: pathOf({ documentId }) })));
  const readBatch = vi.spyOn(server.services.updateLog, 'readBatch');
  const limited = await request({ server, cookie: owner.cookie, path: pathOf({ documentId: opened.at(-1)! }) });
  expect([limited.status, readBatch.mock.calls.length]).toEqual([HttpStatus.TooManyRequests, 0]);
  await server.stop();
});

test('polling a document whose bootstrap is in flight makes no query to the log and spends no budget', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const readBatch = vi.spyOn(server.services.updateLog, 'readBatch');
  const statuses = await Promise.all(
    Array.from({ length: OPEN_UNCOMMITTED_PER_MINUTE + 1 }, () => request({ server, cookie: owner.cookie, path: pathOf({ documentId }) })),
  );
  expect([new Set(statuses.map((response) => response.status)), readBatch.mock.calls.length]).toEqual([new Set([HttpStatus.Ok]), 0]);
  await server.stop();
});

test('a waiting editor polling the same uncommitted document is answered 200 every time, never 429', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  await openedBy({ server, user: owner, documentId });
  const statuses = await Promise.all(
    Array.from({ length: OPEN_UNCOMMITTED_PER_MINUTE + 1 }, () => request({ server, cookie: editor.cookie, path: pathOf({ documentId }) })),
  );
  expect(new Set(statuses.map((response) => response.status))).toEqual(new Set([HttpStatus.Ok]));
  await server.stop();
});

test('a known committed room answers Join while the open budget is spent (mutation: drop the known-committed shortcut)', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  commitRoom({ services: server.services, documentId, userId: owner.id });
  await request({ server, cookie: owner.cookie, path: pathOf({ documentId }) });
  Array.from({ length: OPEN_UNCOMMITTED_PER_MINUTE }).forEach((_, index) =>
    server.services.openBudget.record({ userId: owner.id, documentId: `spent-${index}` }),
  );
  const again = await request({ server, cookie: owner.cookie, path: pathOf({ documentId }) });
  expect([again.status, ((await again.json()) as OpenedDocument).roomMode]).toEqual([HttpStatus.Ok, RoomMode.Join]);
  await server.stop();
});

test('a committed room answers Join and ready for a reader and an editor', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: ['Hello'] });
  commitBootstrap(client.document);
  await expect.poll(() => server.services.runtime.roomMode(documentId)).toBe(RoomMode.Join);
  const answers = await Promise.all([reader, editor].map((user) => openedBy({ server, user, documentId })));
  expect(answers.map(({ roomMode, bootstrap }) => [roomMode, bootstrap.stage])).toEqual([
    [RoomMode.Join, BootstrapStage.Ready],
    [RoomMode.Join, BootstrapStage.Ready],
  ]);
  client.close();
  await server.stop();
});

test('download names the file with an ASCII fallback and an RFC 5987 filename*', async () => {
  const { server, owner } = await signedInOwner();
  const created: DocumentSummary = await (await createBlank({ server, cookie: owner.cookie, title: FORBIDDEN_TITLE_FILE_NAME })).json();
  const downloaded = await request({
    server,
    cookie: owner.cookie,
    path: pathOf({ documentId: created.id, resource: DocumentResource.Download }),
  });
  expect(downloaded.headers.get('content-disposition')).toBe(
    `attachment; filename="Q3 _final_ (draft)'s plan*.docx"; filename*=UTF-8''Q3%20%22final%22%20%28draft%29%27s%20plan%2A.docx`,
  );
  await server.stop();
});

test('a blank document downloads a valid docx', async () => {
  const { server, owner } = await signedInOwner();
  const created = await createBlank({ server, cookie: owner.cookie, title: 'Blank' });
  expect(created.status).toBe(HttpStatus.Created);
  const { id }: DocumentSummary = await created.json();
  const downloaded = await request({ server, cookie: owner.cookie, path: pathOf({ documentId: id, resource: DocumentResource.Download }) });
  expect(await isDocx(new Uint8Array(await downloaded.arrayBuffer()))).toBe(true);
  await server.stop();
});

test('a blank create with an invalid title is 400', async () => {
  const { server, owner } = await signedInOwner();
  expect((await createBlank({ server, cookie: owner.cookie, title: '   ' })).status).toBe(HttpStatus.BadRequest);
  await server.stop();
});

test('members marks the connected owner online', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  const { members }: DocumentMembers = await (
    await request({ server, cookie: owner.cookie, path: pathOf({ documentId, resource: DocumentResource.Members }) })
  ).json();
  expect(members.map((member) => [member.user.id, member.online])).toEqual([
    [owner.id, true],
    [reader.id, false],
  ]);
  client.close();
  await server.stop();
});

const EXTRA_MEMBER_COUNT = AUTHOR_COLOR_SLOT_COUNT - 1;

async function documentWithSixMembers() {
  const { server, documentId, owner } = await documentWithOwner();
  const extras = await Promise.all(
    Array.from({ length: EXTRA_MEMBER_COUNT }, () => memberWithRole({ server, documentId, role: DocumentRole.Editor })),
  );
  return { server, documentId, users: [owner, ...extras] };
}

test('members carry a distinct colorSlot per member for the first six members', async () => {
  const { server, documentId, users } = await documentWithSixMembers();
  const path = pathOf({ documentId, resource: DocumentResource.Members });
  const { members }: DocumentMembers = await (await request({ server, cookie: users[0]!.cookie, path })).json();
  expect(new Set(members.map((member) => member.colorSlot)).size).toBe(AUTHOR_COLOR_SLOT_COUNT);
  await server.stop();
});

test('open answers the colorSlot the members route gives the same user', async () => {
  const { server, documentId, users } = await documentWithSixMembers();
  const path = pathOf({ documentId, resource: DocumentResource.Members });
  const { members }: DocumentMembers = await (await request({ server, cookie: users[0]!.cookie, path })).json();
  commitRoom({ services: server.services, documentId, userId: users[0]!.id });
  const openedSlots = new Map(
    await Promise.all(users.map(async (user) => [user.id, (await openedBy({ server, user, documentId })).colorSlot] as const)),
  );
  expect(new Set(openedSlots.values()).size).toBe(AUTHOR_COLOR_SLOT_COUNT);
  expect(openedSlots).toEqual(new Map(members.map((member) => [member.user.id, member.colorSlot])));
  await server.stop();
});

test('members reports whether the current user is online', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  const path = pathOf({ documentId, resource: DocumentResource.Members });
  const ownerAnswer: DocumentMembers = await (await request({ server, cookie: owner.cookie, path })).json();
  const readerAnswer: DocumentMembers = await (await request({ server, cookie: reader.cookie, path })).json();
  expect([ownerAnswer.isCurrentUserOnline, readerAnswer.isCurrentUserOnline]).toEqual([true, false]);
  client.close();
  await server.stop();
});

test('signed-out requests get 401', async () => {
  const { server } = await signedInOwner();
  const paths = [ApiPath.Documents, pathOf({ documentId: randomUUID() }), `${ApiPath.ShareLinks}/token/accept`];
  const statuses = await Promise.all(paths.map(async (path) => (await fetch(`${server.baseUrl}${path}`)).status));
  expect(statuses).toEqual([HttpStatus.Unauthorized, HttpStatus.Unauthorized, HttpStatus.Unauthorized]);
  expect((await fetch(`${server.baseUrl}${ApiPath.Health}`)).status).toBe(HttpStatus.Ok);
  expect((await fetch(`${server.baseUrl}${ApiPath.Me}`)).status).toBe(HttpStatus.Ok);
  await server.stop();
});

test('delete removes the row, the file, the log and the events, and closes the room', async () => {
  const { server, owner } = await signedInOwner();
  const created: DocumentSummary = await (await createBlank({ server, cookie: owner.cookie, title: 'Doomed' })).json();
  beginOwnerBootstrap({ server, documentId: created.id, owner });
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId: created.id });
  const closed = new Promise<void>((resolve) => client.provider.on('close', () => resolve()));
  writeStory({ document: client.document, texts: ['Hello'] });
  await expect.poll(() => server.services.updateLog.hasUpdates(created.id)).toBe(true);
  const forgetPipeline = vi.spyOn(server.services.timelinePipelines, 'forget');
  const deleted = await request({ server, cookie: owner.cookie, path: pathOf({ documentId: created.id }), method: HttpMethod.Delete });
  expect(deleted.status).toBe(HttpStatus.NoContent);
  expect(forgetPipeline).toHaveBeenCalledWith(created.id);
  expect((await request({ server, cookie: owner.cookie, path: pathOf({ documentId: created.id }) })).status).toBe(HttpStatus.NotFound);
  await expect(server.services.storage.read(created.id)).rejects.toThrow();
  expect(server.services.updateLog.hasUpdates(created.id)).toBe(false);
  expect(server.services.readModel.cursor(created.id)).toBeNull();
  await closed;
  client.close();
  await server.stop();
});

test('forgetting a document clears its insights cooldowns after the projection forgets it', async () => {
  const { server, documentId } = await documentWithOwner();
  const { selection } = server.services.insights;
  selection.cooldown.start(documentId);
  const projectionForget = vi.spyOn(server.services.scheduler, 'forget');
  const insightsForgets = [vi.spyOn(selection, 'forget')];
  await server.services.runtime.forget(documentId);
  expect(selection.cooldown.size()).toBe(0);
  const order = [projectionForget, ...insightsForgets].map((spy) => spy.mock.invocationCallOrder[0]!);
  expect(order).toEqual([...order].sort((left, right) => left - right));
  insightsForgets.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  await server.stop();
});

test('deleting a document forgets it once through the runtime, then removes the file', async () => {
  const { server, owner } = await signedInOwner();
  const created: DocumentSummary = await (await createBlank({ server, cookie: owner.cookie, title: 'Doomed' })).json();
  const { selection } = server.services.insights;
  const forget = vi.spyOn(server.services.runtime, 'forget');
  const remove = vi.spyOn(server.services.storage, 'remove');
  const insightsForgets = [vi.spyOn(selection, 'forget')];
  await request({ server, cookie: owner.cookie, path: pathOf({ documentId: created.id }), method: HttpMethod.Delete });
  expect(forget).toHaveBeenCalledTimes(1);
  insightsForgets.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  expect(forget.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]!);
  await server.stop();
});

test('the title drops the docx extension in any case', async () => {
  const { server, owner } = await signedInOwner();
  const created: DocumentSummary = await (
    await upload({ server, cookie: owner.cookie, bytes: await docxBytes('Cased'), fileName: 'REPORT.DOCX' })
  ).json();
  expect(created.title).toBe('REPORT');
  await server.stop();
});

test('a file name longer than a title may be is truncated', async () => {
  const { server, owner } = await signedInOwner();
  const response = await upload({
    server,
    cookie: owner.cookie,
    bytes: await docxBytes('Long'),
    fileName: `${'a'.repeat(TITLE_MAX_LENGTH + 100)}.docx`,
  });
  expect(response.status).toBe(HttpStatus.Created);
  const created: DocumentSummary = await response.json();
  expect(created.title).toBe('a'.repeat(TITLE_MAX_LENGTH));
  await server.stop();
});

test('a failing file write leaves no document row', async () => {
  const { server, owner } = await signedInOwner();
  vi.spyOn(server.services.storage, 'put').mockRejectedValue(new Error('disk full'));
  const response = await upload({ server, cookie: owner.cookie, bytes: await docxBytes('Unsaved') });
  expect(response.status).toBe(HttpStatus.InternalServerError);
  expect((await listOf({ server, cookie: owner.cookie })).mine).toEqual([]);
  await server.stop();
});

test('a malformed multipart body is 400', async () => {
  const { server, owner } = await signedInOwner();
  const response = await fetch(`${server.baseUrl}${ApiPath.Documents}`, {
    method: HttpMethod.Post,
    headers: { cookie: owner.cookie, origin: server.baseUrl, 'content-type': 'multipart/form-data; boundary=missing' },
    body: 'not multipart at all',
  });
  expect(response.status).toBe(HttpStatus.BadRequest);
  await server.stop();
});

test('a chunked upload over the limit is 413 while streaming', async () => {
  const { server, owner } = await signedInOwner();
  const chunk = new Uint8Array(BYTES_PER_MEGABYTE);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      Array.from({ length: STREAMED_CHUNK_COUNT }).forEach(() => controller.enqueue(chunk));
      controller.close();
    },
  });
  const response = await fetch(`${server.baseUrl}${ApiPath.Documents}`, {
    method: HttpMethod.Post,
    headers: { cookie: owner.cookie, origin: server.baseUrl, 'content-type': 'multipart/form-data; boundary=chunked' },
    body,
    duplex: 'half',
  } as RequestInit);
  expect(response.status).toBe(HttpStatus.PayloadTooLarge);
  expect(readdirSync(join(server.databaseDirectory, DOCUMENT_FILES_DIRECTORY)).length).toBe(0);
  await server.stop();
});

test('refused uploads spend nothing of the minute, and a good upload after them is still admitted', async () => {
  const { server, owner } = await signedInOwner();
  vi.spyOn(server.services.runtime, 'bootstrapRoom').mockImplementation(() => COMMITTED_WITHOUT_BOOTSTRAP);
  const refusals = await Promise.all(
    Array.from({ length: UPLOADS_PER_MINUTE }, () =>
      upload({ server, cookie: owner.cookie, bytes: new Uint8Array(8), type: 'text/plain' }),
    ),
  );
  expect(new Set(refusals.map((response) => response.status))).toEqual(new Set([HttpStatus.UnsupportedMediaType]));
  expect((await upload({ server, cookie: owner.cookie, bytes: await docxBytes('Plan') })).status).toBe(HttpStatus.Created);
  await server.stop();
});
