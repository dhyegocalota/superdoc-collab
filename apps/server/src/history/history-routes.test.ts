import { commitBootstrap, writeStory } from '@superdoc-history/history/testing';
import { DocumentResource, DocumentRole, documentApiPath, HttpStatus, type DocumentEditEvents } from '@superdoc-history/types';
import { ReadModel } from '@superdoc-history/history';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import * as Y from 'yjs';
import { READ_MODEL_DATABASE_FILE } from '../database/connection';
import { connectToDocument, documentWithOwner, memberWithRole } from '../testing/collaboration-client';
import { insertedBy, readEvents } from '../testing/events-client';
import { signedInUser, signInExisting, startTestServer, TEST_USER_PASSWORD } from '../testing/test-server';

const PROJECTION_TIMEOUT_MS = 15_000;

test("events attribute each author's inserted text", async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: ownerClient.document, texts: ['Hello'] });
  commitBootstrap(ownerClient.document);
  writeStory({ document: ownerClient.document, texts: ['Hello A'] });
  const editorClient = await connectToDocument({ server, cookie: editor.cookie, documentId });
  writeStory({ document: editorClient.document, texts: ['Hello A B'] });
  await expect.poll(async () => insertedBy({ events: await readEvents({ server, cookie: owner.cookie, documentId }), userId: editor.id }), { timeout: PROJECTION_TIMEOUT_MS }).toBe(' B');
  expect(insertedBy({ events: await readEvents({ server, cookie: owner.cookie, documentId }), userId: owner.id })).toBe(' A');
  expect((await readEvents({ server, cookie: owner.cookie, documentId })).nextAfterSequence).toBeNull();
  [ownerClient, editorClient].forEach((client) => client.close());
  await server.stop();
});

test('a late declaration corrects the author of an already projected edit', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const ana = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: ownerClient.document, texts: ['Hello'] });
  commitBootstrap(ownerClient.document);
  const anaOffline = new Y.Doc();
  Y.applyUpdate(anaOffline, Y.encodeStateAsUpdate(ownerClient.document));
  writeStory({ document: anaOffline, texts: ['Hello Ana'] });
  Y.applyUpdate(ownerClient.document, Y.encodeStateAsUpdate(anaOffline));
  const authorsOfAnaText = async () => (await readEvents({ server, cookie: owner.cookie, documentId })).filter((event) => event.inserted === ' Ana').map((event) => event.authors.map((author) => author.id));
  await expect.poll(authorsOfAnaText, { timeout: PROJECTION_TIMEOUT_MS }).toEqual([[owner.id]]);
  const anaClient = await connectToDocument({ server, cookie: ana.cookie, documentId, document: anaOffline });
  anaClient.provider.setAwarenessField('userId', ana.id);
  await expect.poll(authorsOfAnaText).toEqual([[ana.id]]);
  [ownerClient, anaClient].forEach((client) => client.close());
  await server.stop();
});

test('afterSequence returns only later events and a non-member gets 404', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: ['Hello'] });
  commitBootstrap(client.document);
  writeStory({ document: client.document, texts: ['Hello A'] });
  writeStory({ document: client.document, texts: ['Hello A B'] });
  await expect.poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId })).length, { timeout: PROJECTION_TIMEOUT_MS }).toBe(2);
  const events = await readEvents({ server, cookie: owner.cookie, documentId });
  const eventsPath = `${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Events })}`;
  const later = (await (await fetch(`${eventsPath}?afterSequence=${events[0]?.sequence}`, { headers: { cookie: owner.cookie } })).json()) as DocumentEditEvents;
  expect(later.events).toEqual(events.slice(1));
  const invalidStatuses = await Promise.all(['-1', '', 'abc', '1.5'].map(async (value) => (await fetch(`${eventsPath}?afterSequence=${value}`, { headers: { cookie: owner.cookie } })).status));
  expect(invalidStatuses).toEqual([HttpStatus.BadRequest, HttpStatus.BadRequest, HttpStatus.BadRequest, HttpStatus.BadRequest]);
  const stranger = await signedInUser({ server, name: 'Stranger' });
  const strangerResponse = await fetch(eventsPath, { headers: { cookie: stranger.cookie } });
  const missingResponse = await fetch(`${server.baseUrl}${documentApiPath({ documentId: randomUUID(), resource: DocumentResource.Events })}`, { headers: { cookie: stranger.cookie } });
  expect([strangerResponse.status, await strangerResponse.json()]).toEqual([HttpStatus.NotFound, await missingResponse.json()]);
  client.close();
  await server.stop();
});

test('events survive a server restart', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: ['Hello'] });
  commitBootstrap(client.document);
  writeStory({ document: client.document, texts: ['Hello A'] });
  await expect.poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId })).length, { timeout: PROJECTION_TIMEOUT_MS }).toBe(1);
  const before = await readEvents({ server, cookie: owner.cookie, documentId });
  client.close();
  await server.stop();
  const restarted = await startTestServer({ databaseDirectory: server.databaseDirectory });
  const cookie = await signInExisting({ server: restarted, email: owner.email, password: TEST_USER_PASSWORD });
  expect(await readEvents({ server: restarted, cookie, documentId })).toEqual(before);
  const reopened = await connectToDocument({ server: restarted, cookie, documentId });
  writeStory({ document: reopened.document, texts: ['Hello A B'] });
  await expect.poll(async () => (await readEvents({ server: restarted, cookie, documentId })).map((event) => event.inserted), { timeout: PROJECTION_TIMEOUT_MS }).toEqual([' A', ' B']);
  expect((await readEvents({ server: restarted, cookie, documentId })).slice(0, 1)).toEqual(before);
  reopened.close();
  await restarted.stop();
});

test('a batch committed between the cursor and the events read stays out of both', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const { readModel } = server.services;
  const SETTLED_SEQUENCE = 3;
  readModel.commit({ documentName: documentId, events: [], lastSequence: SETTLED_SEQUENCE });
  const writer = new ReadModel(new Database(join(server.databaseDirectory, READ_MODEL_DATABASE_FILE)));
  const originalCursor = readModel.cursor.bind(readModel);
  vi.spyOn(readModel, 'cursor').mockImplementation((documentName) => {
    const cursor = originalCursor(documentName);
    writer.commit({ documentName: documentId, events: [], lastSequence: SETTLED_SEQUENCE + 1 });
    return cursor;
  });
  const response = await fetch(`${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Events })}`, { headers: { cookie: owner.cookie } });
  expect(((await response.json()) as DocumentEditEvents).cursor).toBe(SETTLED_SEQUENCE);
  await server.stop();
});
