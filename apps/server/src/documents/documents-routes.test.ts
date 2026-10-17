import { buildSeedDocx, isDocx, TrackedChangeKind } from '@superdoc-history/history';
import { commitBootstrap, writeStory } from '@superdoc-history/history/testing';
import {
  ApiPath,
  ClientActor,
  DOCUMENT_NOT_READY_ERROR,
  DOCX_MIME_TYPE,
  documentApiPath,
  DocumentResource,
  DocumentRole,
  HttpMethod,
  HttpStatus,
  MAX_UPLOAD_BYTES,
  TITLE_MAX_LENGTH,
  RoomMode,
  UPLOAD_FIELD,
  type DocumentMembers,
  type DocumentsList,
  type DocumentSummary,
  type OpenedDocument,
} from '@superdoc-history/types';
import JSZip from 'jszip';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { connectToDocument, documentWithOwner, memberWithRole } from '../testing/collaboration-client';
import { readEvents } from '../testing/events-client';
import { signedInOwner, signedInUser, type TestServer } from '../testing/test-server';
import { DOCUMENT_FILES_DIRECTORY } from '../database/connection';
import { ROOM_MODE_SCAN_BATCH_SIZE } from '../collaboration/collaboration-runtime';

const IMPORT_TIMEOUT_MS = 30_000;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const TWELVE_MEGABYTES = 12 * BYTES_PER_MEGABYTE;
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

function request({
  server,
  cookie,
  path,
  method = HttpMethod.Get,
  body,
}: {
  server: TestServer;
  cookie: string;
  path: string;
  method?: HttpMethod;
  body?: unknown;
}): Promise<Response> {
  return fetch(`${server.baseUrl}${path}`, {
    method,
    headers: { cookie, ...JSON_HEADERS },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function pathOf({ documentId, resource }: { documentId: string; resource?: DocumentResource }): string {
  return documentApiPath({ documentId, resource });
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
  const roomModeOf = async () =>
    ((await (await request({ server, cookie: owner.cookie, path: pathOf({ documentId }) })).json()) as OpenedDocument).roomMode;
  expect(await roomModeOf()).toBe(RoomMode.Create);
  commitBootstrap(client.document);
  await expect.poll(roomModeOf).toBe(RoomMode.Join);
  client.close();
  await server.stop();
});

test('roomMode scans a long log in pages until the first committed bootstrap', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  Array.from({ length: ROOM_MODE_SCAN_BATCH_SIZE + LONG_LOG_EXTRA_UPDATES }).forEach((_, index) =>
    writeStory({ document: client.document, texts: ['x'.repeat(index + 1)] }),
  );
  commitBootstrap(client.document);
  const batchSize = ROOM_MODE_SCAN_BATCH_SIZE;
  await expect
    .poll(() => server.services.updateLog.readBatch({ documentName: documentId, afterSequence: batchSize, limit: 1 }).length)
    .toBe(1);
  const readAll = vi.spyOn(server.services.updateLog, 'read');
  const readBatch = vi.spyOn(server.services.updateLog, 'readBatch');
  const roomMode = ((await (await request({ server, cookie: owner.cookie, path: pathOf({ documentId }) })).json()) as OpenedDocument)
    .roomMode;
  expect(roomMode).toBe(RoomMode.Join);
  expect(readAll).not.toHaveBeenCalled();
  expect(readBatch.mock.calls.length).toBeGreaterThan(1);
  client.close();
  await server.stop();
});

test('a reader opening a never-created room gets 409 NOT_READY', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const notReady = await request({ server, cookie: reader.cookie, path: pathOf({ documentId }) });
  expect([notReady.status, await notReady.json()]).toEqual([HttpStatus.Conflict, { error: DOCUMENT_NOT_READY_ERROR }]);
  const editorOpen = await request({ server, cookie: editor.cookie, path: pathOf({ documentId }) });
  expect([editorOpen.status, ((await editorOpen.json()) as OpenedDocument).roomMode]).toEqual([HttpStatus.Ok, RoomMode.Create]);
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: ['Hello'] });
  commitBootstrap(client.document);
  await expect
    .poll(async () => (await request({ server, cookie: reader.cookie, path: pathOf({ documentId }) })).status)
    .toBe(HttpStatus.Ok);
  const readerOpen: OpenedDocument = await (await request({ server, cookie: reader.cookie, path: pathOf({ documentId }) })).json();
  expect(readerOpen.roomMode).toBe(RoomMode.Join);
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
  const { topics, summaries, selection } = server.services.insights;
  [topics, summaries, selection].forEach((service) => service.cooldown.start(documentId));
  const projectionForget = vi.spyOn(server.services.scheduler, 'forget');
  const insightsForgets = [vi.spyOn(topics, 'forget'), vi.spyOn(summaries, 'forget'), vi.spyOn(selection, 'forget')];
  await server.services.runtime.forget(documentId);
  expect([topics, summaries, selection].map((service) => service.cooldown.size())).toEqual([0, 0, 0]);
  const order = [projectionForget, ...insightsForgets].map((spy) => spy.mock.invocationCallOrder[0]!);
  expect(order).toEqual([...order].sort((left, right) => left - right));
  insightsForgets.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  await server.stop();
});

test('deleting a document forgets it once through the runtime, then removes the file', async () => {
  const { server, owner } = await signedInOwner();
  const created: DocumentSummary = await (await createBlank({ server, cookie: owner.cookie, title: 'Doomed' })).json();
  const { topics, summaries, selection } = server.services.insights;
  const forget = vi.spyOn(server.services.runtime, 'forget');
  const remove = vi.spyOn(server.services.storage, 'remove');
  const insightsForgets = [vi.spyOn(topics, 'forget'), vi.spyOn(summaries, 'forget'), vi.spyOn(selection, 'forget')];
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
