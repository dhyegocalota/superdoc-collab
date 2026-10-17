import { commitBootstrap as markBootstrapCommitted } from '@superdoc-collab/history/testing';
import { ApiPath, ClientActor, DocumentRole, RoomMode } from '@superdoc-collab/types';
import * as Y from 'yjs';
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
import { commitBootstrap } from '../testing/committed-room';
import { signedInUser, TEST_AUTH_SECRET, type TestServer, type TestUser } from '../testing/test-server';
import { MAX_STORE_DEBOUNCE_MS } from './collaboration-server';
import type { CollaborationContext } from './collaboration-context';
import { SUPERDOC_ROOM_PREFIX } from './room-name';

const KEYSTROKES_PER_DEBOUNCE = 4;

type ChangePayload = Parameters<NonNullable<TestServer['services']['hocuspocus']['configuration']['onChange']>>[0];

type Scenario = { server: TestServer; documentId: string; owner: TestUser };

const SECRET_PAYLOAD_TEXT = 'secret-payload-text';

function updateWith({ committed }: { committed: boolean }): { document: Y.Doc; update: Uint8Array } {
  const document = new Y.Doc();
  document.getText('t').insert(0, SECRET_PAYLOAD_TEXT);
  if (committed) markBootstrapCommitted(document);
  return { document, update: Y.encodeStateAsUpdate(document) };
}

function contextOf({
  userId,
  documentId,
  attempt,
  epoch,
}: {
  userId: string;
  documentId: string;
  attempt: number;
  epoch: string;
}): CollaborationContext {
  return { userId, documentId, actor: ClientActor.Human, creatorAttempt: attempt, creatorEpoch: epoch };
}

function sendChange({
  server,
  context,
  document,
  update,
}: {
  server: TestServer;
  context: CollaborationContext;
  document: Y.Doc;
  update: Uint8Array;
}): Promise<void> {
  const payload = {
    update,
    context,
    document,
    documentName: `${SUPERDOC_ROOM_PREFIX}${context.documentId}`,
    transactionOrigin: {},
  } as unknown as ChangePayload;
  return server.services.hocuspocus.configuration.onChange(payload) as Promise<void>;
}

function loggedRows(scenario: Pick<Scenario, 'server' | 'documentId'>) {
  return scenario.server.services.updateLog.read({ documentName: scenario.documentId, untilSequence: Number.MAX_SAFE_INTEGER });
}

async function supersededScenario() {
  const { server, documentId, owner } = await documentWithOwner();
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const { reservations } = server.services;
  const first = reservations.reserve({ documentId, userId: owner.id })!;
  reservations.release({ documentId, attempt: first.attempt });
  const second = reservations.reserve({ documentId, userId: editor.id })!;
  const superseded = contextOf({ userId: owner.id, documentId, attempt: first.attempt, epoch: first.epoch });
  const latest = contextOf({ userId: editor.id, documentId, attempt: second.attempt, epoch: second.epoch });
  return { server, documentId, superseded, latest };
}

describe('collaboration write fence', () => {
  test("a superseded attempt's update is not appended to the log", async () => {
    const { server, documentId, superseded, latest } = await supersededScenario();
    await sendChange({ server, context: superseded, ...updateWith({ committed: false }) });
    expect(loggedRows({ server, documentId })).toHaveLength(0);
    await sendChange({ server, context: latest, ...updateWith({ committed: false }) });
    expect(loggedRows({ server, documentId })).toHaveLength(1);
    await server.stop();
  });
  test("a stale attempt's refusal is logged once per connection, with the document id and without the payload", async () => {
    const { server, documentId, superseded } = await supersededScenario();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const change = updateWith({ committed: false });
    await sendChange({ server, context: superseded, ...change });
    await sendChange({ server, context: superseded, ...change });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls.flat().join(' ')).toContain(documentId);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET_PAYLOAD_TEXT);
    warn.mockRestore();
    await server.stop();
  });
  test('a fenced committing update does not mark the room committed', async () => {
    const { server, documentId, superseded } = await supersededScenario();
    await sendChange({ server, context: superseded, ...updateWith({ committed: true }) });
    expect(loggedRows({ server, documentId })).toHaveLength(0);
    expect(server.services.runtime.roomMode(documentId)).toBe(RoomMode.Create);
    await server.stop();
  });
  test('the committing update is appended once with its snapshot and the room becomes committed', async () => {
    const { server, documentId, latest } = await supersededScenario();
    await sendChange({ server, context: latest, ...updateWith({ committed: true }) });
    expect(loggedRows({ server, documentId })).toHaveLength(1);
    expect(server.services.updateLog.latestSnapshot({ documentName: documentId, atOrBefore: Number.MAX_SAFE_INTEGER })?.sequence).toBe(1);
    expect(server.services.runtime.roomMode(documentId)).toBe(RoomMode.Join);
    await server.stop();
  });
});

describe('collaboration admission to an uncommitted room', () => {
  test('a member is refused on an uncommitted room with no attempt', async () => {
    const { server, documentId } = await documentWithOwner();
    const member = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(connectToDocument({ server, cookie: member.cookie, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    expect(warn.mock.calls.flat().join(' ')).toContain(documentId);
    warn.mockRestore();
    await server.stop();
  });
  test('an agent room token is refused on an uncommitted room with no attempt', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const token = signRoomToken({ secret: TEST_AUTH_SECRET, userId: owner.id, documentId, now: Date.now() });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(connectAgentToDocument({ server, token, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    expect(warn.mock.calls.flat().join(' ')).toContain(documentId);
    warn.mockRestore();
    await server.stop();
  });
});

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
  function expiredIssueTime(): number {
    return Date.now() - ROOM_TOKEN_TTL_MS - 1;
  }
  function roomToken({ userId, documentId, now = Date.now() }: { userId: string; documentId: string; now?: number }): string {
    return signRoomToken({ secret: TEST_AUTH_SECRET, userId, documentId, now });
  }

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
        connectAgentToDocument({ server, token: roomToken({ userId: owner.id, documentId, now: expiredIssueTime() }), documentId }),
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
    commitBootstrap({ services: server.services, documentId, userId: owner.id });
    const outcome = connect({ server, documentId, owner });
    if (!accepted) await expect(outcome).rejects.toBeInstanceOf(CollaborationRefusedError);
    if (accepted) (await outcome).close();
    await server.stop();
  });

  test('an agent update is logged with the Agent actor', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    commitBootstrap({ services: server.services, documentId, userId: owner.id });
    const agent = await connectAgentToDocument({ server, token: roomToken({ userId: owner.id, documentId }), documentId });
    agent.document.getText('t').insert(0, 'tracked by the agent');
    await expect
      .poll(() =>
        server.services.updateLog
          .read({ documentName: documentId, untilSequence: Number.MAX_SAFE_INTEGER })
          .map((row) => row.connectionActor),
      )
      .toEqual([ClientActor.Human, ClientActor.Agent]);
    agent.close();
    await server.stop();
  });

  test('a browser update is logged with the Human actor', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    commitBootstrap({ services: server.services, documentId, userId: owner.id });
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
    const { server, documentId, owner } = await documentWithOwner();
    commitBootstrap({ services: server.services, documentId, userId: owner.id });
    const member = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
    const token = roomToken({ userId: member.id, documentId });
    server.database.sqlite.prepare('DELETE FROM document_members WHERE user_id = ?').run(member.id);
    await expect(connectAgentToDocument({ server, token, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    await server.stop();
  });

  test('a reader room token connects read-only and no update is logged', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    commitBootstrap({ services: server.services, documentId, userId: owner.id });
    const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
    const agent = await connectAgentToDocument({ server, token: roomToken({ userId: reader.id, documentId }), documentId });
    agent.document.getText('t').insert(0, 'reader');
    const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId });
    ownerClient.document.getText('t').insert(0, 'owner');
    await expect.poll(() => server.services.updateLog.hasUpdates(documentId)).toBe(true);
    await expect.poll(() => agent.document.getText('t').toString()).toContain('owner');
    const logged = server.services.updateLog.read({ documentName: documentId, untilSequence: Number.MAX_SAFE_INTEGER });
    expect(logged.map((update) => update.connectionUserId)).not.toContain(reader.id);
    expect(logged.map((update) => update.connectionActor)).not.toContain(ClientActor.Agent);
    [agent, ownerClient].forEach((client) => client.close());
    await server.stop();
  });
});
