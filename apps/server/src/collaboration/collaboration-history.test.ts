import { DocumentRole } from '@superdoc-collab/types';
import { IdentitySource } from '@superdoc-collab/history';
import { randomUUID } from 'node:crypto';
import { commitBootstrap, writeStory } from '@superdoc-collab/history/testing';
import { expect, test, vi } from 'vitest';
import { CollaborationRefusedError, connectToDocument, documentWithOwner, memberWithRole } from '../testing/collaboration-client';
import { commitBootstrap as commitBootstrapFixture } from '../testing/committed-room';
import { signedInUser, signInExisting, startTestServer, TEST_USER_PASSWORD } from '../testing/test-server';
import { waitForCommit } from '../testing/committed-room';

const ALL = Number.MAX_SAFE_INTEGER;
const SNAPSHOT_WAIT_MS = 15_000;
const UPDATES_BEFORE_SNAPSHOT = 1001;

test("a reader's update is acknowledged but never logged", async () => {
  const { server, documentId, owner } = await documentWithOwner();
  commitBootstrapFixture({ services: server.services, documentId, userId: owner.id });
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  const readerClient = await connectToDocument({ server, cookie: reader.cookie, documentId });
  readerClient.document.getText('t').insert(0, 'reader');
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId });
  ownerClient.document.getText('t').insert(0, 'owner');
  await expect.poll(() => server.services.updateLog.hasUpdates(documentId)).toBe(true);
  await expect.poll(() => readerClient.document.getText('t').toString()).toContain('owner');
  expect(ownerClient.document.getText('t').toString()).toBe('owner');
  expect(
    server.services.updateLog.read({ documentName: documentId, untilSequence: ALL }).map((update) => update.connectionUserId),
  ).not.toContain(reader.id);
  [readerClient, ownerClient].forEach((client) => client.close());
  await server.stop();
});

test('a restarted server restores the room from the log', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  commitBootstrapFixture({ services: server.services, documentId, userId: owner.id });
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  client.document.getText('t').insert(0, 'persisted');
  await expect.poll(() => server.services.updateLog.read({ documentName: documentId, untilSequence: ALL }).length).toBe(2);
  client.close();
  await server.stop();
  const restarted = await startTestServer({ databaseDirectory: server.databaseDirectory });
  const reopened = await connectToDocument({
    server: restarted,
    cookie: await signInExisting({ server: restarted, email: owner.email, password: TEST_USER_PASSWORD }),
    documentId,
  });
  expect(reopened.document.getText('t').toString()).toBe('persisted');
  reopened.close();
  await restarted.stop();
});

test("a member's update is logged with their user id", async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  client.document.getText('t').insert(0, 'hello');
  await expect
    .poll(() => server.services.updateLog.read({ documentName: documentId, untilSequence: ALL }).map((update) => update.connectionUserId))
    .toEqual([owner.id]);
  client.close();
  await server.stop();
});

test('a non-member is refused like a missing session', async () => {
  const { server, documentId } = await documentWithOwner();
  const stranger = await signedInUser({ server, name: 'Stranger' });
  await expect(connectToDocument({ server, cookie: stranger.cookie, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
  await server.stop();
});

test('an awareness userId equal to the socket user declares the identity', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  client.provider.setAwarenessField('userId', owner.id);
  client.document.getText('t').insert(0, 'declared');
  await expect
    .poll(() => server.services.updateLog.identitySources(documentId).get(client.document.clientID))
    .toBe(IdentitySource.Declared);
  client.close();
  await server.stop();
});

test('an awareness userId of someone else stays observed', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  client.provider.setAwarenessField('userId', 'someone-else');
  client.document.getText('t').insert(0, 'spoofed');
  await expect
    .poll(() => server.services.updateLog.identitySources(documentId).get(client.document.clientID))
    .toBe(IdentitySource.Observed);
  client.close();
  await server.stop();
});

test('a member of one document is refused on another', async () => {
  const { server, documentId } = await documentWithOwner();
  const stranger = await signedInUser({ server, name: 'Elsewhere' });
  server.services.documents.create({ id: randomUUID(), title: 'Other', ownerUserId: stranger.id });
  await expect(connectToDocument({ server, cookie: stranger.cookie, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
  await server.stop();
});

test('an upgrade the server destroys rejects the connection promptly', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  await expect(
    connectToDocument({ server, cookie: owner.cookie, documentId, origin: 'https://evil.example', bootstrapToken: null }),
  ).rejects.toBeInstanceOf(CollaborationRefusedError);
  await server.stop();
});

test('every logged update requests a throttled projection', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const request = vi.spyOn(server.services.throttle, 'request');
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  client.document.getText('t').insert(0, 'x');
  await expect.poll(() => request.mock.calls.map(([requested]) => requested)).toContain(documentId);
  client.close();
  await server.stop();
});

test('the worker writes the heavy snapshot', { timeout: SNAPSHOT_WAIT_MS * 2 }, async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: [''] });
  commitBootstrap(client.document);
  await waitForCommit({ services: server.services, documentId });
  Array.from({ length: UPDATES_BEFORE_SNAPSHOT }).forEach(() => client.document.getText('t').insert(0, 'x'));
  await expect
    .poll(() => server.services.updateLog.latestSnapshot({ documentName: documentId, atOrBefore: ALL })?.sequence, {
      timeout: SNAPSHOT_WAIT_MS,
    })
    .toBeDefined();
  client.close();
  await server.stop();
});
