import { commitBootstrap as markBootstrapCommitted, writeStory } from '@superdoc-collab/history/testing';
import {
  ACCESS_REVOKED_CLOSE_CODE,
  ApiPath,
  ClientActor,
  DocumentRole,
  OPEN_UNCOMMITTED_PER_MINUTE,
  RoomMode,
  SUPERSEDED_ATTEMPT_CLOSE_CODE,
  RESTARTED_ATTEMPT_REASON,
  SUPERSEDED_ATTEMPT_REASON,
  TAB_QUERY_KEY,
} from '@superdoc-collab/types';
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
import {
  createCollaborationServer,
  MAX_STORE_DEBOUNCE_MS,
  OPEN_BUDGET_LOG,
  REFUSED_TICKET_LOG,
  UNTICKETED_REFUSAL_LOG,
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
  return {
    userId,
    documentId,
    actor: ClientActor.Human,
    creatorAttempt: attempt,
    creatorEpoch: epoch,
    tabId: null,
    impersonationEndsAt: null,
  };
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

test('a creator update on an uncommitted room never queries the log or the snapshots', async () => {
  const { server, documentId, latest } = await supersededScenario();
  const readBatch = vi.spyOn(server.services.updateLog, 'readBatch');
  const latestSnapshot = vi.spyOn(server.services.updateLog, 'latestSnapshot');
  await sendChange({ server, context: latest, ...updateWith({ committed: false }) });
  expect(loggedRows({ server, documentId })).toHaveLength(1);
  expect([readBatch.mock.calls.length, latestSnapshot.mock.calls.length]).toEqual([0, 0]);
  await server.stop();
});

test('an appended update from the latest attempt refreshes its reservation (mutation: drop the touch)', async () => {
  const { server, documentId, latest } = await supersededScenario();
  const touch = vi.spyOn(server.services.reservations, 'touch');
  await sendChange({ server, context: latest, ...updateWith({ committed: false }) });
  expect(touch).toHaveBeenCalledWith({ documentId, attempt: latest.creatorAttempt });
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

describe('collaboration ticket from another epoch', () => {
  const FOREIGN_EPOCH = 'a-previous-process';

  test('a committed room admits a socket carrying a ticket from another epoch as an ordinary editor', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    commitBootstrap({ services: server.services, documentId, userId: owner.id });
    const returning = await connectToDocument({ server, cookie: owner.cookie, documentId, ticket: { attempt: 1, epoch: FOREIGN_EPOCH } });
    returning.document.getText('t').insert(0, 'edited after the restart');
    await expect.poll(() => loggedRows({ server, documentId }).length).toBe(2);
    returning.close();
    await server.stop();
  });
  test('an uncommitted room still refuses a socket carrying a ticket from another epoch', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const refused = connectToDocument({ server, cookie: owner.cookie, documentId, ticket: { attempt: 1, epoch: FOREIGN_EPOCH } });
    await expect(refused).rejects.toBeInstanceOf(CollaborationRefusedError);
    await server.stop();
  });
});

describe('collaboration takeover and the committed room', () => {
  test('a creator returning after another editor committed is closed with 4403 and writes nothing', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
    const { reservations, runtime } = server.services;
    const abandoned = reservations.attemptOf({ documentId, userId: owner.id })!;
    const creator = await connectToDocument({ server, cookie: owner.cookie, documentId });
    expect(runtime.reserveCreator({ documentId, userId: editor.id })).toBeNull();
    creator.close();
    await expect.poll(() => roomsUnloaded(server)).toBe(true);
    const takeover = runtime.reserveCreator({ documentId, userId: editor.id })!;
    const winner = await connectToDocument({ server, cookie: editor.cookie, documentId, ticket: takeover });
    writeStory({ document: winner.document, texts: ['committed by the winner'] });
    markBootstrapCommitted(winner.document);
    await expect.poll(() => runtime.roomMode(documentId)).toBe(RoomMode.Join);
    const rowsBeforeReturn = loggedRows({ server, documentId }).length;
    const returning = connectToDocument({
      server,
      cookie: owner.cookie,
      documentId,
      ticket: { attempt: abandoned, epoch: takeover.epoch },
    });
    await expect(returning).rejects.toMatchObject({ closeCode: SUPERSEDED_ATTEMPT_CLOSE_CODE });
    expect(loggedRows({ server, documentId })).toHaveLength(rowsBeforeReturn);
    winner.close();
    await server.stop();
  });
});

function roomsUnloaded(server: TestServer): boolean {
  return server.services.hocuspocus.documents.size === 0;
}

describe('collaboration holder reopening', () => {
  test('the holder opening twice gets a new attempt, the first socket gets 4403 and only the second writes', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const first = await connectToDocument({ server, cookie: owner.cookie, documentId });
    const second = server.services.runtime.reserveCreator({ documentId, userId: owner.id })!;
    expect(second.attempt).toBe(2);
    expect(await first.closed).toEqual({ code: SUPERSEDED_ATTEMPT_CLOSE_CODE, reason: SUPERSEDED_ATTEMPT_REASON });
    const staleContext = contextOf({ userId: owner.id, documentId, attempt: 1, epoch: second.epoch });
    await sendChange({ server, context: staleContext, ...updateWith({ committed: false }) });
    expect(loggedRows({ server, documentId })).toHaveLength(0);
    const next = await connectToDocument({ server, cookie: owner.cookie, documentId, ticket: second });
    next.document.getText('t').insert(0, 'from the second tab');
    await expect.poll(() => loggedRows({ server, documentId }).length).toBe(1);
    next.close();
    await server.stop();
  });
  test('a reload in the middle of the create ends with one committed bootstrap and no partial', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const half = await connectToDocument({ server, cookie: owner.cookie, documentId });
    half.document.getText('t').insert(0, 'half of the seed');
    await expect.poll(() => loggedRows({ server, documentId }).length).toBeGreaterThan(0);
    const reloaded = server.services.runtime.reserveCreator({ documentId, userId: owner.id })!;
    await half.closed;
    await expect.poll(() => roomsUnloaded(server)).toBe(true);
    const winner = await connectToDocument({ server, cookie: owner.cookie, documentId, ticket: reloaded });
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
  test('the next attempt starts from an empty room after the creator closes its tab', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
    const creator = await connectToDocument({ server, cookie: owner.cookie, documentId });
    creator.document.getText('t').insert(0, 'abandoned paragraph');
    await expect.poll(() => loggedRows({ server, documentId }).length).toBeGreaterThan(0);
    creator.close();
    await expect.poll(() => roomsUnloaded(server)).toBe(true);
    const ticket = server.services.runtime.reserveCreator({ documentId, userId: editor.id });
    expect(ticket).toEqual({ attempt: 2, epoch: server.services.reservations.epoch });
    const next = await connectToDocument({ server, cookie: editor.cookie, documentId, ticket });
    expect(next.document.getText('t').toString()).toBe('');
    next.close();
    await server.stop();
  });
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
    const ticket = server.services.runtime.reserveCreator({ documentId, userId: editor.id })!;
    const winner = await connectToDocument({ server, cookie: editor.cookie, documentId, ticket });
    writeStory({ document: winner.document, texts: ['committed story'] });
    markBootstrapCommitted(winner.document);
    await expect.poll(() => server.services.runtime.roomMode(documentId)).toBe(RoomMode.Join);
    winner.close();
    await expect.poll(() => roomsUnloaded(server)).toBe(true);
    const reader = await connectToDocument({ server, cookie: owner.cookie, documentId, ticket: null });
    expect(reader.document.getText('t').toString()).not.toContain('abandoned partial seed');
    expect(reader.document.getMap('content').size).toBeGreaterThan(0);
    reader.close();
    await server.stop();
  });
  test("the holder's reconnect is accepted", async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const first = await connectToDocument({ server, cookie: owner.cookie, documentId });
    first.close();
    await expect.poll(() => roomsUnloaded(server)).toBe(true);
    const second = await connectToDocument({ server, cookie: owner.cookie, documentId });
    second.close();
    await server.stop();
  });
  test('closing the last tab releases the reservation for another editor', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
    const creator = await connectToDocument({ server, cookie: owner.cookie, documentId });
    creator.close();
    await expect.poll(() => server.services.runtime.reserveCreator({ documentId, userId: editor.id })).not.toBeNull();
    await server.stop();
  });
  test('closing one of two tabs keeps the reservation and another editor still gets 409', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
    const firstTab = await connectToDocument({ server, cookie: owner.cookie, documentId });
    const secondTab = await connectToDocument({ server, cookie: owner.cookie, documentId });
    firstTab.close();
    await expect.poll(() => server.services.hocuspocus.documents.values().next().value?.getConnectionsCount()).toBe(1);
    expect(server.services.runtime.reserveCreator({ documentId, userId: editor.id })).toBeNull();
    secondTab.close();
    await server.stop();
  });
});

describe('collaboration admission to an uncommitted room', () => {
  test("another user's ticket is refused on an uncommitted room and logged as a refused ticket (mutation: drop the holder check)", async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
    const ownersTicket = server.services.reservations.reserve({ documentId, userId: owner.id })!;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(connectToDocument({ server, cookie: editor.cookie, documentId, ticket: ownersTicket })).rejects.toBeInstanceOf(
      CollaborationRefusedError,
    );
    expect(warn).toHaveBeenCalledWith(`${REFUSED_TICKET_LOG} ${documentId}`);
    warn.mockRestore();
    await server.stop();
  });
  test('a ticket from another process epoch is refused with the restart reason and logged as a refused ticket', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ticket = { attempt: 1, epoch: randomUUID() };
    await expect(connectToDocument({ server, cookie: owner.cookie, documentId, ticket })).rejects.toMatchObject({
      reason: RESTARTED_ATTEMPT_REASON,
    });
    expect(warn).toHaveBeenCalledWith(`${REFUSED_TICKET_LOG} ${documentId}`);
    warn.mockRestore();
    await server.stop();
  });
  test('an older attempt of this epoch is refused with the superseded reason', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const olderTicket = server.services.reservations.reserve({ documentId, userId: owner.id })!;
    server.services.reservations.reserve({ documentId, userId: owner.id });
    await expect(connectToDocument({ server, cookie: owner.cookie, documentId, ticket: olderTicket })).rejects.toMatchObject({
      reason: SUPERSEDED_ATTEMPT_REASON,
    });
    await server.stop();
  });
  test('a user who exhausted the open budget is refused before the log is scanned', async () => {
    const { server, documentId, owner } = await documentWithOwner();
    Array.from({ length: OPEN_UNCOMMITTED_PER_MINUTE }).forEach((_, index) =>
      server.services.openBudget.record({ userId: owner.id, documentId: `spent-${index}` }),
    );
    const readBatch = vi.spyOn(server.services.updateLog, 'readBatch');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(connectToDocument({ server, cookie: owner.cookie, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    expect(readBatch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(`${OPEN_BUDGET_LOG} ${documentId}`);
    warn.mockRestore();
    await server.stop();
  });
  test('a member is refused on an uncommitted room with no attempt', async () => {
    const { server, documentId } = await documentWithOwner();
    const member = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(connectToDocument({ server, cookie: member.cookie, documentId })).rejects.toBeInstanceOf(CollaborationRefusedError);
    expect(warn).toHaveBeenCalledWith(`${UNTICKETED_REFUSAL_LOG} ${documentId}`);
    warn.mockRestore();
    await server.stop();
  });
  test("an agent is refused on an uncommitted room even with the owner's valid ticket", async () => {
    const { server, documentId, owner } = await documentWithOwner();
    const ticket = server.services.reservations.reserve({ documentId, userId: owner.id });
    const token = signRoomToken({ secret: TEST_AUTH_SECRET, userId: owner.id, documentId, now: Date.now() });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(connectAgentToDocument({ server, token, documentId, ticket })).rejects.toBeInstanceOf(CollaborationRefusedError);
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

test("a connection's tab id is in the room's online tab ids and leaves with the socket", async () => {
  const { server, documentId, owner } = await documentWithOwner();
  commitBootstrap({ services: server.services, documentId, userId: owner.id });
  const tabId = randomUUID();
  const client = await connectToDocument({
    server,
    cookie: owner.cookie,
    documentId,
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

test('unloading a room releases the memory of the process through the injected function', async () => {
  const releaseRoomMemory = vi.fn();
  const updateLog = { clientIdentities: () => [] } as unknown as Parameters<typeof createCollaborationServer>[0]['updateLog'];
  const hocuspocus = createCollaborationServer({
    updateLog,
    releaseRoomMemory,
    onLogged: vi.fn(),
    onStored: vi.fn(),
  } as unknown as Parameters<typeof createCollaborationServer>[0]);
  await hocuspocus.hooks('afterUnloadDocument', { instance: hocuspocus, documentName: `${SUPERDOC_ROOM_PREFIX}${randomUUID()}` });
  expect(releaseRoomMemory).toHaveBeenCalledOnce();
});
