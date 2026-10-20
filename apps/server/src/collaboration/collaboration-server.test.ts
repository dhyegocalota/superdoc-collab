import { buildSeedDocx } from '@superdoc-collab/history';
import { commitBootstrap as markBootstrapCommitted, writeStory } from '@superdoc-collab/history/testing';
import {
  ACCESS_REVOKED_CLOSE_CODE,
  ApiPath,
  BOOTSTRAP_MEMORY_RESERVE_MEGABYTES,
  BootstrapStage,
  ClientActor,
  DocumentRole,
  OPEN_UNCOMMITTED_PER_MINUTE,
  RoomMode,
  TAB_QUERY_KEY,
} from '@superdoc-collab/types';
import { Document } from '@hocuspocus/server';
import * as Y from 'yjs';
import { randomUUID } from 'node:crypto';
import { expect, test, describe, vi, onTestFinished } from 'vitest';
import { ROOM_TOKEN_TTL_MS, signBootstrapToken, signRoomToken, verifyBootstrapToken } from '../agent/room-tokens';
import {
  CollaborationRefusedError,
  connectAgentToDocument,
  connectAsBootstrap,
  connectToDocument,
  documentWithOwner,
  memberWithRole,
} from '../testing/collaboration-client';
import { commitBootstrap } from '../testing/committed-room';
import { signedInOwner, signedInUser, TEST_AUTH_SECRET, type TestServer, type TestUser } from '../testing/test-server';
import { HEAVY_ROOMS_FULL_REASON } from '@superdoc-collab/types';
import {
  createCollaborationServer,
  HEAVY_ROOMS_REFUSAL_LOG,
  MAX_STORE_DEBOUNCE_MS,
  OPEN_BUDGET_LOG,
  UNCOMMITTED_REFUSAL_LOG,
} from './collaboration-server';
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

function contextOf({ userId, documentId, attempt }: { userId: string; documentId: string; attempt: string }): CollaborationContext {
  return {
    userId,
    documentId,
    actor: ClientActor.Human,
    bootstrapAttempt: attempt,
    holdsRoomPlace: false,
    tabId: null,
    impersonationEndsAt: null,
  };
}

function attemptOf({ bootstrapToken, documentId }: { bootstrapToken: string; documentId: string }): string {
  const verified = verifyBootstrapToken({ secret: TEST_AUTH_SECRET, token: bootstrapToken, documentId, now: Date.now() });
  if (!verified) throw new Error('The bootstrap token does not verify.');
  return verified.attempt;
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
  const { onChange } = server.services.hocuspocus.configuration;
  if (!onChange) throw new Error('The collaboration server has no onChange hook.');
  return onChange(payload) as Promise<void>;
}

function loggedRows(scenario: Pick<Scenario, 'server' | 'documentId'>) {
  return scenario.server.services.updateLog.read({ documentName: scenario.documentId, untilSequence: Number.MAX_SAFE_INTEGER });
}

async function staleScenario() {
  const { server, documentId, owner, bootstrapToken } = await documentWithOwner();
  const stale = contextOf({ userId: owner.id, documentId, attempt: 'an-attempt-that-is-not-current' });
  const latest = contextOf({ userId: owner.id, documentId, attempt: attemptOf({ bootstrapToken, documentId }) });
  return { server, documentId, owner, bootstrapToken, stale, latest };
}

function roomsUnloaded(server: TestServer): boolean {
  return server.services.hocuspocus.documents.size === 0;
}

describe('collaboration write fence', () => {
  test("a stale attempt's update is not appended to the log", async () => {
    const { server, documentId, stale, latest } = await staleScenario();
    await sendChange({ server, context: stale, ...updateWith({ committed: false }) });
    expect(loggedRows({ server, documentId })).toHaveLength(0);
    await sendChange({ server, context: latest, ...updateWith({ committed: false }) });
    expect(loggedRows({ server, documentId })).toHaveLength(1);
    await server.stop();
  });
  test("a stale attempt's refusal is logged once per connection, with the document id and without the payload", async () => {
    const { server, documentId, stale } = await staleScenario();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const change = updateWith({ committed: false });
    await sendChange({ server, context: stale, ...change });
    await sendChange({ server, context: stale, ...change });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls.flat().join(' ')).toContain(documentId);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET_PAYLOAD_TEXT);
    warn.mockRestore();
    await server.stop();
  });
  test('a fenced committing update does not mark the room committed', async () => {
    const { server, documentId, stale } = await staleScenario();
    await sendChange({ server, context: stale, ...updateWith({ committed: true }) });
    expect(loggedRows({ server, documentId })).toHaveLength(0);
    expect(server.services.runtime.roomMode(documentId)).toBe(RoomMode.Create);
    await server.stop();
  });
  test('the committing update is appended once with its snapshot, the room becomes committed and the bootstrap ready', async () => {
    const { server, documentId, latest } = await staleScenario();
    const change = updateWith({ committed: true });
    await sendChange({ server, context: latest, ...change });
    expect(loggedRows({ server, documentId })).toHaveLength(1);
    expect(server.services.updateLog.latestSnapshot({ documentName: documentId, atOrBefore: Number.MAX_SAFE_INTEGER })?.sequence).toBe(1);
    expect(server.services.runtime.roomMode(documentId)).toBe(RoomMode.Join);
    expect(server.services.roomBootstrap.progressOf(documentId)).toMatchObject({
      stage: BootstrapStage.Ready,
      stateBytes: Y.encodeStateAsUpdate(change.document).byteLength,
    });
    await server.stop();
  });
});

test('a bootstrap update on an uncommitted room never queries the log or the snapshots', async () => {
  const { server, documentId, latest } = await staleScenario();
  const readBatch = vi.spyOn(server.services.updateLog, 'readBatch');
  const latestSnapshot = vi.spyOn(server.services.updateLog, 'latestSnapshot');
  await sendChange({ server, context: latest, ...updateWith({ committed: false }) });
  expect(loggedRows({ server, documentId })).toHaveLength(1);
  expect([readBatch.mock.calls.length, latestSnapshot.mock.calls.length]).toEqual([0, 0]);
  await server.stop();
});

test('the committing bootstrap update never scans the log or the snapshots', async () => {
  const { server, documentId, latest } = await staleScenario();
  const readBatch = vi.spyOn(server.services.updateLog, 'readBatch');
  const latestSnapshot = vi.spyOn(server.services.updateLog, 'latestSnapshot');
  await sendChange({ server, context: latest, ...updateWith({ committed: true }) });
  expect(server.services.runtime.roomMode(documentId)).toBe(RoomMode.Join);
  expect([readBatch.mock.calls.length, latestSnapshot.mock.calls.length]).toEqual([0, 0]);
  await server.stop();
});

test('an appended bootstrap update reports its bytes as received and a stale one does not', async () => {
  const { server, stale, latest } = await staleScenario();
  const received = vi.spyOn(server.services.roomBootstrap, 'received');
  const change = updateWith({ committed: false });
  await sendChange({ server, context: stale, ...change });
  expect(received).not.toHaveBeenCalled();
  await sendChange({ server, context: latest, ...change });
  expect(received).toHaveBeenCalledExactlyOnceWith({ documentId: latest.documentId, bytes: change.update.byteLength });
  await server.stop();
});

describe('collaboration fence on a committed room', () => {
  test("a member overwriting the room's bootstrap marker does not stop later Join writes", async () => {
    const { server, documentId, owner } = await documentWithOwner();
    commitBootstrap({ services: server.services, documentId, userId: owner.id });
    const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
    const other = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
    const flipper = await connectToDocument({ server, cookie: editor.cookie, documentId });
    flipper.document.getMap('meta').set('bootstrapState', 'pending');
    const writer = await connectToDocument({ server, cookie: other.cookie, documentId });
    writer.document.getText('t').insert(0, 'still written');
    await expect.poll(() => loggedRows({ server, documentId }).map((row) => row.connectionUserId)).toContain(other.id);
    [flipper, writer].forEach((client) => client.close());
    await server.stop();
  });
});

describe('collaboration bootstrap socket', () => {
  test('is admitted on an uncommitted room as the owner with the Human actor', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const bootstrapper = await connectToDocument({ server, cookie: owner.cookie, documentId });
    bootstrapper.document.getText('t').insert(0, 'first paragraph');
    await expect.poll(() => loggedRows({ server, documentId }).length).toBe(1);
    expect(loggedRows({ server, documentId })[0]).toMatchObject({ connectionUserId: owner.id, connectionActor: ClientActor.Human });
    bootstrapper.close();
    await server.stop();
  });
  test('commits the room, and a member joins the committed state', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const bootstrapper = await connectToDocument({ server, cookie: owner.cookie, documentId });
    writeStory({ document: bootstrapper.document, texts: ['committed story'] });
    markBootstrapCommitted(bootstrapper.document);
    await expect.poll(() => server.services.runtime.roomMode(documentId)).toBe(RoomMode.Join);
    const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
    const joiner = await connectToDocument({ server, cookie: editor.cookie, documentId });
    expect(joiner.document.getMap('content').size).toBeGreaterThan(0);
    [bootstrapper, joiner].forEach((client) => client.close());
    await server.stop();
  });
  test('a new attempt makes the earlier one stale: its token is refused and its writes are dropped', async () => {
    const { server, documentId, owner, bootstrapToken } = await documentWithOwner();
    const first = await connectToDocument({ server, cookie: owner.cookie, documentId });
    const secondToken = server.services.roomBootstrap.begin(documentId);
    first.document.getText('t').insert(0, 'written by the stale socket');
    await expect(connectAsBootstrap({ server, token: bootstrapToken, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    const second = await connectAsBootstrap({ server, token: secondToken, documentId });
    second.document.getText('t').insert(0, 'from the current attempt');
    await expect.poll(() => loggedRows({ server, documentId }).length).toBe(1);
    expect(loggedRows({ server, documentId })).toHaveLength(1);
    [first, second].forEach((client) => client.close());
    await server.stop();
  });
  test('a reload in the middle of the bootstrap ends with one committed bootstrap and no partial', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const half = await connectToDocument({ server, cookie: owner.cookie, documentId });
    half.document.getText('t').insert(0, 'half of the seed');
    await expect.poll(() => loggedRows({ server, documentId }).length).toBeGreaterThan(0);
    half.close();
    await expect.poll(() => roomsUnloaded(server)).toBe(true);
    const winner = await connectAsBootstrap({ server, token: server.services.roomBootstrap.begin(documentId), documentId });
    writeStory({ document: winner.document, texts: ['committed story'] });
    markBootstrapCommitted(winner.document);
    await expect.poll(() => server.services.runtime.roomMode(documentId)).toBe(RoomMode.Join);
    const { updateLog } = server.services;
    const firstSnapshot = updateLog.snapshotAfter({ documentName: documentId, afterSequence: 0 })!;
    expect(updateLog.snapshotAfter({ documentName: documentId, afterSequence: firstSnapshot.sequence })).toBeNull();
    const restored = new Y.Doc();
    Y.applyUpdate(restored, firstSnapshot.state);
    expect(restored.getText('t').toString()).not.toContain('half of the seed');
    winner.close();
    await server.stop();
  });
});

describe('collaboration room lifecycle', () => {
  test('a fresh attempt loads an empty room although the log holds a pending bootstrap claim', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const partial = new Y.Doc();
    partial.getMap('meta').set('bootstrapState', 'pending');
    writeStory({ document: partial, texts: ['half a seed'] });
    server.services.updateLog.append({
      documentName: documentId,
      connectionUserId: owner.id,
      connectionActor: ClientActor.Human,
      update: Y.encodeStateAsUpdate(partial),
    });
    const next = await connectToDocument({ server, cookie: owner.cookie, documentId });
    expect(next.document.getMap('meta').size).toBe(0);
    expect(next.document.getMap('content').size).toBe(0);
    next.close();
    await server.stop();
  });
  test('a room load after a commit excludes an abandoned partial seed', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
    const abandoned = await connectToDocument({ server, cookie: owner.cookie, documentId });
    abandoned.document.getText('t').insert(0, 'abandoned partial seed');
    await expect.poll(() => loggedRows({ server, documentId }).length).toBeGreaterThan(0);
    abandoned.close();
    await expect.poll(() => roomsUnloaded(server)).toBe(true);
    const winner = await connectAsBootstrap({ server, token: server.services.roomBootstrap.begin(documentId), documentId });
    writeStory({ document: winner.document, texts: ['committed story'] });
    markBootstrapCommitted(winner.document);
    await expect.poll(() => server.services.runtime.roomMode(documentId)).toBe(RoomMode.Join);
    winner.close();
    await expect.poll(() => roomsUnloaded(server)).toBe(true);
    const reader = await connectToDocument({ server, cookie: editor.cookie, documentId });
    expect(reader.document.getText('t').toString()).not.toContain('abandoned partial seed');
    expect(reader.document.getMap('content').size).toBeGreaterThan(0);
    reader.close();
    await server.stop();
  });
  test("the bootstrap's reconnect is accepted", async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const first = await connectToDocument({ server, cookie: owner.cookie, documentId });
    first.close();
    await expect.poll(() => roomsUnloaded(server)).toBe(true);
    const second = await connectToDocument({ server, cookie: owner.cookie, documentId });
    second.close();
    await server.stop();
  });
});

describe('collaboration admission to an uncommitted room', () => {
  function bootstrapTokenFor({ userId, documentId, now = Date.now() }: { userId: string; documentId: string; now?: number }): string {
    return signBootstrapToken({ secret: TEST_AUTH_SECRET, userId, documentId, attempt: 'any-attempt', now });
  }

  test('an expired bootstrap token is refused', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const attempt = attemptOf({ bootstrapToken: server.services.roomBootstrap.begin(documentId), documentId });
    const token = signBootstrapToken({
      secret: TEST_AUTH_SECRET,
      userId: owner.id,
      documentId,
      attempt,
      now: Date.now() - ROOM_TOKEN_TTL_MS - 1,
    });
    await expect(connectAsBootstrap({ server, token, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    await server.stop();
  });
  test('a token whose attempt is not the current one is refused', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    await expect(
      connectAsBootstrap({ server, token: bootstrapTokenFor({ userId: owner.id, documentId }), documentId }),
    ).rejects.toBeInstanceOf(CollaborationRefusedError);
    await server.stop();
  });
  test('a token minted for another document is refused', async () => {
    const { server, documentId, owner, bootstrapToken } = await documentWithOwner();
    const attempt = attemptOf({ bootstrapToken, documentId });
    const token = signBootstrapToken({ secret: TEST_AUTH_SECRET, userId: owner.id, documentId: randomUUID(), attempt, now: Date.now() });
    await expect(connectAsBootstrap({ server, token, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    await server.stop();
  });
  test('a token of a user who left the document is refused', async () => {
    const { server, documentId } = await documentWithOwner();
    const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
    server.database.sqlite.prepare('DELETE FROM document_members WHERE user_id = ?').run(editor.id);
    const token = signBootstrapToken({ secret: TEST_AUTH_SECRET, userId: editor.id, documentId, attempt: 'any-attempt', now: Date.now() });
    await expect(connectAsBootstrap({ server, token, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    await server.stop();
  });
  test('an agent room token is not a bootstrap token', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const token = signRoomToken({ secret: TEST_AUTH_SECRET, userId: owner.id, documentId, now: Date.now() });
    await expect(connectAsBootstrap({ server, token, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    await server.stop();
  });
  test('a bootstrap token is not an agent room token', async () => {
    const { server, documentId, bootstrapToken } = await documentWithOwner();
    await expect(connectAgentToDocument({ server, token: bootstrapToken, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    await server.stop();
  });
  test('a user who exhausted the open budget is refused before the log is scanned', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    Array.from({ length: OPEN_UNCOMMITTED_PER_MINUTE }).forEach((_, index) =>
      server.services.openBudget.record({ userId: owner.id, documentId: `spent-${index}` }),
    );
    const readBatch = vi.spyOn(server.services.updateLog, 'readBatch');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(connectToDocument({ server, cookie: owner.cookie, documentId, bootstrapToken: null })).rejects.toBeInstanceOf(
      CollaborationRefusedError,
    );
    expect(readBatch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(`${OPEN_BUDGET_LOG} ${documentId}`);
    warn.mockRestore();
    await server.stop();
  });
  test('the bootstrap socket spends no open budget', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    Array.from({ length: OPEN_UNCOMMITTED_PER_MINUTE }).forEach((_, index) =>
      server.services.openBudget.record({ userId: owner.id, documentId: `spent-${index}` }),
    );
    const bootstrapper = await connectToDocument({ server, cookie: owner.cookie, documentId });
    bootstrapper.close();
    await server.stop();
  });
  test('a member is refused on an uncommitted room, even the owner with a session', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const member = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(connectToDocument({ server, cookie: member.cookie, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    expect(warn).toHaveBeenCalledWith(`${UNCOMMITTED_REFUSAL_LOG} ${documentId}`);
    await expect(connectToDocument({ server, cookie: owner.cookie, documentId, bootstrapToken: null })).rejects.toBeInstanceOf(
      CollaborationRefusedError,
    );
    warn.mockRestore();
    await server.stop();
  });
  test('an agent room token is refused on an uncommitted room', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const token = signRoomToken({ secret: TEST_AUTH_SECRET, userId: owner.id, documentId, now: Date.now() });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(connectAgentToDocument({ server, token, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    expect(warn.mock.calls.flat().join(' ')).toContain(documentId);
    warn.mockRestore();
    await server.stop();
  });
});

describe('heavy room ceiling', () => {
  test('a member and an agent are refused a room while the ceiling is reached for it, and admitted once it is not', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    commitBootstrap({ services: server.services, documentId, userId: owner.id });
    const refuses = vi.spyOn(server.services.heavyRooms, 'admits').mockReturnValue(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(connectToDocument({ server, cookie: owner.cookie, documentId, bootstrapToken: null })).rejects.toMatchObject({
      reason: HEAVY_ROOMS_FULL_REASON,
    });
    const token = signRoomToken({ secret: TEST_AUTH_SECRET, userId: owner.id, documentId, now: Date.now() });
    await expect(connectAgentToDocument({ server, token, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    expect(refuses).toHaveBeenCalledWith({ documentId, userId: owner.id });
    expect(warn).toHaveBeenCalledWith(`${HEAVY_ROOMS_REFUSAL_LOG} ${documentId}`);
    refuses.mockReturnValue(true);
    (await connectToDocument({ server, cookie: owner.cookie, documentId, bootstrapToken: null })).close();
    warn.mockRestore();
    await server.stop();
  });
  test('the bootstrap socket is never refused by the ceiling', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const refuses = vi.spyOn(server.services.heavyRooms, 'admits').mockReturnValue(false);
    (await connectToDocument({ server, cookie: owner.cookie, documentId })).close();
    expect(refuses).not.toHaveBeenCalled();
    await server.stop();
  });
});

describe('collaboration authentication', () => {
  test('accepts a valid session cookie', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    commitBootstrap({ services: server.services, documentId, userId: owner.id });
    const client = await connectToDocument({ server, cookie: owner.cookie, documentId, bootstrapToken: null });
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
      connect: ({ server, documentId, owner }: Scenario) =>
        connectToDocument({ server, cookie: owner.cookie, documentId, bootstrapToken: null }),
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
        connectToDocument({ server, cookie: owner.cookie, documentId, path: ApiPath.AgentCollaboration, bootstrapToken: null }),
      accepted: false,
    },
    {
      name: 'a cookie on the bootstrap path',
      connect: ({ server, documentId, owner }: Scenario) =>
        connectToDocument({ server, cookie: owner.cookie, documentId, path: ApiPath.BootstrapCollaboration, bootstrapToken: null }),
      accepted: false,
    },
    {
      name: 'a room token on the bootstrap path',
      connect: ({ server, documentId, owner }: Scenario) =>
        connectAsBootstrap({ server, token: roomToken({ userId: owner.id, documentId }), documentId }),
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
    const browser = await connectToDocument({ server, cookie: owner.cookie, documentId, bootstrapToken: null });
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
    const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId, bootstrapToken: null });
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

test("a connection's tab id is in the room's online tab ids and leaves with the socket", async () => {
  const { server, documentId, owner } = await documentWithOwner();
  commitBootstrap({ services: server.services, documentId, userId: owner.id });
  const tabId = randomUUID();
  const client = await connectToDocument({
    server,
    cookie: owner.cookie,
    documentId,
    bootstrapToken: null,
    path: `${ApiPath.Collaboration}?${TAB_QUERY_KEY}=${tabId}`,
  });
  expect(server.services.runtime.onlineTabIds({ documentId, userId: owner.id })).toEqual(new Set([tabId]));
  client.close();
  await expect.poll(() => server.services.runtime.onlineTabIds({ documentId, userId: owner.id })).toEqual(new Set());
  await server.stop();
});

test.each([
  { name: 'empty', tab: '' },
  { name: 'not a UUID', tab: 'a'.repeat(1024) },
])('a $name tab query is not stored', async ({ tab }) => {
  const { server, documentId, owner } = await documentWithOwner();
  commitBootstrap({ services: server.services, documentId, userId: owner.id });
  const client = await connectToDocument({
    server,
    cookie: owner.cookie,
    documentId,
    bootstrapToken: null,
    path: `${ApiPath.Collaboration}?${TAB_QUERY_KEY}=${tab}`,
  });
  expect(server.services.runtime.onlineTabIds({ documentId, userId: owner.id })).toEqual(new Set());
  client.close();
  await server.stop();
});

test('a socket admitted just before its member was removed is closed with 4404 once connected', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  commitBootstrap({ services: server.services, documentId, userId: owner.id });
  const { documents } = server.services;
  const findRole = documents.findRole.bind(documents);
  const removal = { happened: false };
  vi.spyOn(documents, 'findRole').mockImplementation((parameters) => {
    if (removal.happened) return null;
    const role = findRole(parameters);
    removal.happened = parameters.userId === reader.id;
    return role;
  });
  const closeCode = await connectToDocument({ server, cookie: reader.cookie, documentId }).then(
    (admitted) => admitted.closed.then(({ code }) => code),
    (refused: CollaborationRefusedError) => refused.closeCode,
  );
  expect(closeCode).toBe(ACCESS_REVOKED_CLOSE_CODE);
  await server.stop();
});

test('unloading a room reports its unload to the room memory', async () => {
  const roomMemory = { grew: vi.fn(), unloaded: vi.fn() };
  const hocuspocus = createCollaborationServer({
    roomMemory,
    onLogged: vi.fn(),
    onStored: vi.fn(),
  } as unknown as Parameters<typeof createCollaborationServer>[0]);
  const documentName = `${SUPERDOC_ROOM_PREFIX}${randomUUID()}`;
  hocuspocus.documents.set(documentName, new Document(documentName));
  await hocuspocus.hooks('afterUnloadDocument', { instance: hocuspocus, documentName });
  expect(roomMemory.unloaded).toHaveBeenCalledOnce();
  const [[{ isReloaded }]] = roomMemory.unloaded.mock.calls as [[{ isReloaded: () => boolean }]];
  expect(isReloaded()).toBe(true);
  hocuspocus.documents.delete(documentName);
  expect(isReloaded()).toBe(false);
});

test('an accepted update grows the room memory by its byte length', async () => {
  const roomMemory = { grew: vi.fn(), unloaded: vi.fn() };
  const documentId = randomUUID();
  const hocuspocus = createCollaborationServer({
    roomMemory,
    bootstrap: { isCommitted: () => true },
    updateLog: { append: vi.fn() },
    onLogged: vi.fn(),
    onStored: vi.fn(),
  } as unknown as Parameters<typeof createCollaborationServer>[0]);
  const documentName = `${SUPERDOC_ROOM_PREFIX}${documentId}`;
  const update = new Uint8Array([1, 2, 3, 4, 5]);
  await hocuspocus.hooks('onChange', {
    update,
    context: { userId: 'u1', documentId, actor: ClientActor.Human, bootstrapAttempt: null },
    transactionOrigin: 'client',
    document: new Document(documentName),
  } as unknown as Parameters<typeof hocuspocus.hooks<'onChange'>>[1]);
  expect(roomMemory.grew).toHaveBeenCalledExactlyOnceWith({ documentName, bytes: update.byteLength });
});

describe('collaboration device creator', () => {
  const NO_MEMORY_MEGABYTES = BOOTSTRAP_MEMORY_RESERVE_MEGABYTES;

  async function documentOnDevice() {
    const { server, owner } = await signedInOwner({ memoryLimitMegabytes: NO_MEMORY_MEGABYTES });
    const documentId = randomUUID();
    server.services.documents.create({ id: documentId, title: 'Heavy', ownerUserId: owner.id });
    await server.services.storage.put({ documentId, bytes: await buildSeedDocx([{ text: 'Heavy', trackedChanges: [] }]) });
    server.services.runtime.bootstrapRoom(documentId);
    return { server, owner, documentId };
  }

  function connectAsDeviceCreator({ server, owner, documentId }: Awaited<ReturnType<typeof documentOnDevice>>, tabId?: string) {
    const path = tabId === undefined ? undefined : `${ApiPath.Collaboration}?${TAB_QUERY_KEY}=${tabId}`;
    return connectToDocument({ server, cookie: owner.cookie, documentId, bootstrapToken: null, path });
  }

  test('the owner streams the seed over its member socket, commits, and its next edits are logged as an ordinary member', async () => {
    const scenario = await documentOnDevice();
    const { server, documentId, owner } = scenario;
    const creator = await connectAsDeviceCreator(scenario);
    writeStory({ document: creator.document, texts: ['seeded on the device'] });
    markBootstrapCommitted(creator.document);
    await expect.poll(() => server.services.runtime.roomMode(documentId)).toBe(RoomMode.Join);
    expect(server.services.roomBootstrap.progressOf(documentId)?.stage).toBe(BootstrapStage.Ready);
    const committedRows = loggedRows({ server, documentId }).length;
    creator.document.getText('t').insert(0, 'edit after the commit');
    await expect.poll(() => loggedRows({ server, documentId }).length).toBeGreaterThan(committedRows);
    expect(loggedRows({ server, documentId }).at(-1)).toMatchObject({ connectionUserId: owner.id, connectionActor: ClientActor.Human });
    creator.close();
    await server.stop();
  });

  test('a member who is not the owner is refused while the device prepares the room', async () => {
    const scenario = await documentOnDevice();
    const editor = await memberWithRole({ server: scenario.server, documentId: scenario.documentId, role: DocumentRole.Editor });
    await expect(
      connectToDocument({ server: scenario.server, cookie: editor.cookie, documentId: scenario.documentId, bootstrapToken: null }),
    ).rejects.toBeInstanceOf(CollaborationRefusedError);
    await scenario.server.stop();
  });

  test('a second tab of the owner is refused while the first tab holds the claim, and the first keeps writing', async () => {
    const scenario = await documentOnDevice();
    const { server, documentId } = scenario;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const first = await connectAsDeviceCreator(scenario, randomUUID());
    await expect(connectAsDeviceCreator(scenario, randomUUID())).rejects.toBeInstanceOf(CollaborationRefusedError);
    await expect(connectAsDeviceCreator(scenario)).rejects.toBeInstanceOf(CollaborationRefusedError);
    first.document.getText('t').insert(0, 'written by the claiming tab');
    await expect.poll(() => loggedRows({ server, documentId }).length).toBe(1);
    first.close();
    await server.stop();
  });

  test('a claimed socket whose attempt stopped being current cannot change the room', async () => {
    const scenario = await documentOnDevice();
    const { server, documentId } = scenario;
    const creator = await connectAsDeviceCreator(scenario, randomUUID());
    const lost = vi.spyOn(server.services.roomBootstrap, 'isCurrent').mockReturnValue(false);
    creator.document.getText('t').insert(0, 'written after the claim was lost');
    const room = server.services.hocuspocus.documents.get(`${SUPERDOC_ROOM_PREFIX}${documentId}`)!;
    const isReadOnly = () => [...room.connections.values()].some(({ connection }) => connection.readOnly);
    await expect.poll(isReadOnly).toBe(true);
    expect(lost).toHaveBeenCalled();
    expect(room.getText('t').toString()).toBe('');
    expect(loggedRows({ server, documentId })).toHaveLength(0);
    creator.close();
    await server.stop();
  });

  test('a device claim goes through the heavy room admission and a refused one is closed with its reason', async () => {
    const scenario = await documentOnDevice();
    const { server, documentId, owner } = scenario;
    const refuses = vi.spyOn(server.services.heavyRooms, 'admitsDevice').mockReturnValue(false);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(connectAsDeviceCreator(scenario, randomUUID())).rejects.toMatchObject({ reason: HEAVY_ROOMS_FULL_REASON });
    expect(refuses).toHaveBeenCalledWith({ documentId, userId: owner.id });
    await server.stop();
  });

  test('two sockets of one tab share the claim, both write, and the job lives until the last one leaves', async () => {
    const scenario = await documentOnDevice();
    const { server, documentId } = scenario;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const tabId = randomUUID();
    const first = await connectAsDeviceCreator(scenario, tabId);
    const second = await connectAsDeviceCreator(scenario, tabId);
    first.document.getText('t').insert(0, 'written by the first socket');
    second.document.getText('t').insert(0, 'written by the second socket');
    await expect.poll(() => loggedRows({ server, documentId }).length).toBe(2);
    second.close();
    await expect.poll(() => server.services.runtime.onlineTabIds({ documentId, userId: scenario.owner.id }).size).toBe(1);
    expect(server.services.roomBootstrap.progressOf(documentId)?.stage).toBe(BootstrapStage.Preparing);
    first.close();
    await expect.poll(() => server.services.roomBootstrap.progressOf(documentId)?.stage).toBe(BootstrapStage.Failed);
    await server.stop();
  });

  test('the creator leaving before the commit fails the job', async () => {
    const scenario = await documentOnDevice();
    const { server, documentId } = scenario;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const creator = await connectAsDeviceCreator(scenario);
    creator.document.getText('t').insert(0, 'half of the seed');
    creator.close();
    await expect.poll(() => server.services.roomBootstrap.progressOf(documentId)?.stage).toBe(BootstrapStage.Failed);
    await server.stop();
  });
});

test('loading a room reports the size of its restored state as the size of the room', async () => {
  const roomMemory = { grew: vi.fn(), loaded: vi.fn(), unloaded: vi.fn() };
  const documentId = randomUUID();
  const stored = new Y.Doc();
  stored.getText('t').insert(0, 'restored state');
  const state = Y.encodeStateAsUpdate(stored);
  const hocuspocus = createCollaborationServer({
    roomMemory,
    bootstrap: { isCommitted: () => true },
    updateLog: { latestSnapshot: () => ({ sequence: 1, state }), readRange: () => [] },
    onLogged: vi.fn(),
    onStored: vi.fn(),
  } as unknown as Parameters<typeof createCollaborationServer>[0]);
  const documentName = `${SUPERDOC_ROOM_PREFIX}${documentId}`;
  await hocuspocus.hooks('onLoadDocument', {
    document: new Document(documentName),
    documentName,
  } as unknown as Parameters<typeof hocuspocus.hooks<'onLoadDocument'>>[1]);
  expect(roomMemory.loaded).toHaveBeenCalledExactlyOnceWith({ documentName, bytes: state.byteLength });
  expect(roomMemory.grew).not.toHaveBeenCalled();
});

test('a claimed device socket gives back the place it was admitted with', async () => {
  const roomMemory = { grew: vi.fn(), unloaded: vi.fn(), released: vi.fn() };
  const roomBootstrap = { deviceClosed: vi.fn() };
  const hocuspocus = createCollaborationServer({
    roomMemory,
    roomBootstrap,
    onLogged: vi.fn(),
    onStored: vi.fn(),
  } as unknown as Parameters<typeof createCollaborationServer>[0]);
  const documentName = `${SUPERDOC_ROOM_PREFIX}${randomUUID()}`;
  await hocuspocus.hooks('onDisconnect', {
    socketId: 'socket-1',
    documentName,
    context: { documentId: 'doc-1', userId: 'u1', bootstrapAttempt: 'attempt-1', holdsRoomPlace: true },
  } as unknown as Parameters<typeof hocuspocus.hooks<'onDisconnect'>>[1]);
  expect(roomMemory.released).toHaveBeenCalledExactlyOnceWith({ documentName, userId: 'u1' });
});

test('a socket that disconnects gives back the place its user was admitted with, and a bootstrap socket gives back nothing', async () => {
  const roomMemory = { grew: vi.fn(), unloaded: vi.fn(), released: vi.fn() };
  const roomBootstrap = { deviceClosed: vi.fn() };
  const hocuspocus = createCollaborationServer({
    roomMemory,
    roomBootstrap,
    onLogged: vi.fn(),
    onStored: vi.fn(),
  } as unknown as Parameters<typeof createCollaborationServer>[0]);
  const documentName = `${SUPERDOC_ROOM_PREFIX}${randomUUID()}`;
  const disconnect = (bootstrapAttempt: string | null) =>
    hocuspocus.hooks('onDisconnect', {
      socketId: 'socket-1',
      documentName,
      context: { documentId: 'doc-1', userId: 'u1', bootstrapAttempt, holdsRoomPlace: bootstrapAttempt === null },
    } as unknown as Parameters<typeof hocuspocus.hooks<'onDisconnect'>>[1]);
  await disconnect('attempt-1');
  expect(roomMemory.released).not.toHaveBeenCalled();
  await disconnect(null);
  expect(roomMemory.released).toHaveBeenCalledExactlyOnceWith({ documentName, userId: 'u1' });
});
