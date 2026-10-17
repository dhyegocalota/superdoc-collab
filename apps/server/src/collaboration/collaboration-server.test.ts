import { expect, test, describe, vi } from 'vitest';
import { CollaborationRefusedError, connectToDocument, documentWithOwner } from '../testing/collaboration-client';
import { signedInUser } from '../testing/test-server';
import { MAX_STORE_DEBOUNCE_MS } from './collaboration-server';

const KEYSTROKES_PER_DEBOUNCE = 4;

describe('collaboration authentication', () => {
  test('accepts a valid session cookie', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
    client.close();
    await server.stop();
  });
  test('rejects a missing cookie', async () => {
    const { server, documentId } = await documentWithOwner();
    await expect(connectToDocument({ server, cookie: '', documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    await server.stop();
  });
  test('rejects an expired session cookie', async () => {
    const { server, documentId } = await documentWithOwner();
    const member = await signedInUser({ server, name: 'Bruno' });
    server.database.sqlite.prepare('DELETE FROM session').run();
    await expect(connectToDocument({ server, cookie: member.cookie, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    await server.stop();
  });
});

test('storing is forced after a bounded delay under continuous typing', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const { debounce } = server.services.hocuspocus.configuration;
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  const touch = vi.spyOn(server.services.documents, 'touch');
  const typing = setInterval(() => client.document.getText('t').insert(0, 'x'), debounce / KEYSTROKES_PER_DEBOUNCE);
  await expect.poll(() => touch.mock.calls.length, { timeout: MAX_STORE_DEBOUNCE_MS + debounce }).toBeGreaterThan(0);
  clearInterval(typing);
  expect(touch).toHaveBeenCalledWith(documentId);
  client.close();
  await server.stop();
});
