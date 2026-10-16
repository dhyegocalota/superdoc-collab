import { DocumentRole } from '@superdoc-history/types';
import { IdentitySource } from '@superdoc-history/history';
import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { CollaborationRefusedError, connectToDocument, documentWithOwner, memberWithRole } from '../testing/collaboration-client';
import { signedInUser, signInExisting, startTestServer, TEST_USER_PASSWORD } from '../testing/test-server';

const ALL = Number.MAX_SAFE_INTEGER;

test("a reader's update is acknowledged but never logged", async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  const readerClient = await connectToDocument({ server, cookie: reader.cookie, documentId });
  readerClient.document.getText('t').insert(0, 'reader');
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId });
  ownerClient.document.getText('t').insert(0, 'owner');
  await expect.poll(() => server.services.log.hasUpdates(documentId)).toBe(true);
  await expect.poll(() => readerClient.document.getText('t').toString()).toContain('owner');
  expect(ownerClient.document.getText('t').toString()).toBe('owner');
  expect(server.services.log.read({ documentName: documentId, untilSequence: ALL }).map((update) => update.connectionUserId)).not.toContain(reader.id);
  [readerClient, ownerClient].forEach((client) => client.close());
  await server.stop();
});

test('a restarted server restores the room from the log', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  client.document.getText('t').insert(0, 'persisted');
  await expect.poll(() => server.services.log.hasUpdates(documentId)).toBe(true);
  client.close();
  await server.stop();
  const restarted = await startTestServer({ databaseDirectory: server.databaseDirectory });
  const reopened = await connectToDocument({ server: restarted, cookie: await signInExisting({ server: restarted, email: owner.email, password: TEST_USER_PASSWORD }), documentId });
  expect(reopened.document.getText('t').toString()).toBe('persisted');
  reopened.close();
  await restarted.stop();
});

test("a member's update is logged with their user id", async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  client.document.getText('t').insert(0, 'hello');
  await expect.poll(() => server.services.log.read({ documentName: documentId, untilSequence: ALL }).map((update) => update.connectionUserId)).toEqual([owner.id]);
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
  await expect.poll(() => server.services.log.identitySources(documentId).get(client.document.clientID)).toBe(IdentitySource.Declared);
  client.close();
  await server.stop();
});

test('an awareness userId of someone else stays observed', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  client.provider.setAwarenessField('userId', 'someone-else');
  client.document.getText('t').insert(0, 'spoofed');
  await expect.poll(() => server.services.log.identitySources(documentId).get(client.document.clientID)).toBe(IdentitySource.Observed);
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
  await expect(connectToDocument({ server, cookie: owner.cookie, documentId, origin: 'https://evil.example' })).rejects.toBeInstanceOf(CollaborationRefusedError);
  await server.stop();
});
