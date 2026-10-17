import { ApiPath, ClientActor, DocumentRole } from '@superdoc-history/types';
import { randomUUID } from 'node:crypto';
import { expect, test, describe, vi, onTestFinished } from 'vitest';
import { ROOM_TOKEN_TTL_MS, signRoomToken } from '../agent/room-tokens';
import {
  CollaborationRefusedError,
  connectAgentToDocument,
  connectToDocument,
  documentWithOwner,
  memberWithRole,
} from '../testing/collaboration-client';
import { signedInUser, TEST_AUTH_SECRET, type TestServer, type TestUser } from '../testing/test-server';
import { MAX_STORE_DEBOUNCE_MS } from './collaboration-server';

const KEYSTROKES_PER_DEBOUNCE = 4;
const SETTLE_MS = 1_000;

type Scenario = { server: TestServer; documentId: string; owner: TestUser };

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
  onTestFinished(() => clearInterval(typing));
  await expect.poll(() => touch.mock.calls.length, { timeout: MAX_STORE_DEBOUNCE_MS + debounce }).toBeGreaterThan(0);
  expect(touch).toHaveBeenCalledWith(documentId);
  client.close();
  await server.stop();
});

describe('collaboration credentials by path', () => {
  const NOW_BEFORE_TTL = () => Date.now() - ROOM_TOKEN_TTL_MS - 1;
  const roomToken = ({ userId, documentId, now = Date.now() }: { userId: string; documentId: string; now?: number }) =>
    signRoomToken({ secret: TEST_AUTH_SECRET, userId, documentId, now });

  test.each([
    {
      name: 'a cookie on the browser path',
      connect: ({ server, documentId, owner }: Scenario) => connectToDocument({ server, cookie: owner.cookie, documentId }),
      accepted: true,
    },
    {
      name: 'a room token on the browser path',
      connect: ({ server, documentId, owner }: Scenario) =>
        connectAgentToDocument({ server, token: roomToken({ userId: owner.id, documentId }), documentId, path: ApiPath.Collaboration }),
      accepted: false,
    },
    {
      name: 'a room token on the agent path',
      connect: ({ server, documentId, owner }: Scenario) =>
        connectAgentToDocument({ server, token: roomToken({ userId: owner.id, documentId }), documentId }),
      accepted: true,
    },
    {
      name: 'a cookie on the agent path',
      connect: ({ server, documentId, owner }: Scenario) =>
        connectToDocument({ server, cookie: owner.cookie, documentId, path: ApiPath.AgentCollaboration }),
      accepted: false,
    },
    {
      name: 'a room token minted for another document',
      connect: ({ server, documentId, owner }: Scenario) =>
        connectAgentToDocument({ server, token: roomToken({ userId: owner.id, documentId: randomUUID() }), documentId }),
      accepted: false,
    },
    {
      name: 'an expired room token',
      connect: ({ server, documentId, owner }: Scenario) =>
        connectAgentToDocument({ server, token: roomToken({ userId: owner.id, documentId, now: NOW_BEFORE_TTL() }), documentId }),
      accepted: false,
    },
    {
      name: 'a room token for a person who is not a member',
      connect: ({ server, documentId }: Scenario) =>
        connectAgentToDocument({ server, token: roomToken({ userId: randomUUID(), documentId }), documentId }),
      accepted: false,
    },
  ])('$name is accepted: $accepted', async ({ connect, accepted }) => {
    const { server, documentId, owner } = await documentWithOwner();
    const outcome = connect({ server, documentId, owner });
    if (!accepted) await expect(outcome).rejects.toBeInstanceOf(CollaborationRefusedError);
    if (accepted) (await outcome).close();
    await server.stop();
  });

  test('an agent update is logged with the Agent actor', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const agent = await connectAgentToDocument({ server, token: roomToken({ userId: owner.id, documentId }), documentId });
    agent.document.getText('t').insert(0, 'tracked by the agent');
    await expect
      .poll(() =>
        server.services.updateLog
          .read({ documentName: documentId, untilSequence: Number.MAX_SAFE_INTEGER })
          .map((row) => row.connectionActor),
      )
      .toEqual([ClientActor.Agent]);
    agent.close();
    await server.stop();
  });

  test('a browser update is logged with the Human actor', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const browser = await connectToDocument({ server, cookie: owner.cookie, documentId });
    browser.document.getText('t').insert(0, 'typed by the person');
    await expect
      .poll(() =>
        server.services.updateLog
          .read({ documentName: documentId, untilSequence: Number.MAX_SAFE_INTEGER })
          .map((row) => row.connectionActor),
      )
      .toEqual([ClientActor.Human]);
    browser.close();
    await server.stop();
  });

  test('a room token for a member who was removed is refused', async () => {
    const { server, documentId } = await documentWithOwner();
    const member = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
    const token = roomToken({ userId: member.id, documentId });
    server.database.sqlite.prepare('DELETE FROM document_members WHERE user_id = ?').run(member.id);
    await expect(connectAgentToDocument({ server, token, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    await server.stop();
  });

  test('a reader room token connects read-only and no update is logged', async () => {
    const { server, documentId } = await documentWithOwner();
    const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
    const agent = await connectAgentToDocument({ server, token: roomToken({ userId: reader.id, documentId }), documentId });
    agent.document.getText('t').insert(0, 'ignored by the server');
    await expect.poll(() => server.services.hocuspocus.documents.size).toBe(1);
    const [room] = [...server.services.hocuspocus.documents.values()];
    await expect.poll(() => room!.getText('t').toString(), { timeout: SETTLE_MS }).toBe('');
    expect(server.services.updateLog.read({ documentName: documentId, untilSequence: Number.MAX_SAFE_INTEGER })).toEqual([]);
    agent.close();
    await server.stop();
  });
});
