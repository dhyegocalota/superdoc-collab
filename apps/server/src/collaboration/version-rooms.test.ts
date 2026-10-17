import { readMainStoryText } from '@superdoc-history/history';
import { ApiPath, documentApiPath, MINUTE_MS, versionCollaborationPath, type OpenedDocument, type RoomMode } from '@superdoc-history/types';
import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { CollaborationRefusedError, connectToDocument } from '../testing/collaboration-client';
import { signedInUser } from '../testing/test-server';
import { bootstrappedDocument, editedAfterBootstrap } from '../testing/timeline-client';
import { parseVersionPath, STOP_TIMEOUT_MS } from './version-rooms';

const POLL_TIMEOUT_MS = 15_000;
const SETUP_TIMEOUT_MS = 30_000;
const SHORT_IDLE_MS = 200;
const LONG_IDLE_MS = MINUTE_MS;
const FOREIGN_ORIGIN = 'https://evil.example';
const ROOM_LIMIT = 2;
const DEFAULT_LIMIT = 32;
const DESTROY_FAILURE = 'destroy failed';

function endpointOf({ documentId, sequence }: { documentId: string; sequence: number }): string {
  return versionCollaborationPath({ documentId, sequence });
}

test('two versions of one document load side by side', async () => {
  const { server, documentId, owner, client, bootstrapText, editedText } = await editedAfterBootstrap();
  const marks = server.services.readModel.marks(documentId);
  const [first, last] = [marks[0]!, marks.at(-1)!];
  const [older, newer] = await Promise.all(
    [first, last].map((mark) =>
      connectToDocument({ server, cookie: owner.cookie, documentId, path: endpointOf({ documentId, sequence: mark.sequence }) }),
    ),
  );
  expect([readMainStoryText(older!.document), readMainStoryText(newer!.document)]).toEqual([bootstrapText, editedText]);
  expect(server.services.versionRooms.size()).toBe(2);
  [older!, newer!, client].forEach((connected) => connected.close());
  await server.stop();
});

test('a refused socket never creates an instance', async () => {
  const { server, documentId, owner, client } = await editedAfterBootstrap();
  const stranger = await signedInUser({ server, name: 'Stranger' });
  const marks = server.services.readModel.marks(documentId);
  const sequence = marks[0]!.sequence;
  const notAMark = marks.at(-1)!.sequence + 1;
  const attempts = [
    { cookie: stranger.cookie, path: endpointOf({ documentId, sequence }) },
    { cookie: owner.cookie, path: endpointOf({ documentId, sequence: notAMark }) },
    { cookie: '', path: endpointOf({ documentId, sequence }) },
  ];
  await Promise.all(
    attempts.map((attempt) =>
      expect(connectToDocument({ server, documentId, ...attempt })).rejects.toBeInstanceOf(CollaborationRefusedError),
    ),
  );
  expect(server.services.versionRooms.size()).toBe(0);
  client.close();
  await server.stop();
});

test('a refused upgrade never reaches the worker or the version cache', async () => {
  const { server, documentId, owner, client } = await editedAfterBootstrap();
  const stranger = await signedInUser({ server, name: 'Stranger' });
  const sequence = server.services.readModel.marks(documentId)[0]!.sequence;
  const worker = vi.spyOn(server.services.scheduler, 'version');
  const peek = vi.spyOn(server.services.versions, 'peek');
  const authorize = vi.spyOn(server.services.versionRooms, 'authorize');
  const path = endpointOf({ documentId, sequence });
  await expect(connectToDocument({ server, cookie: stranger.cookie, documentId, path })).rejects.toBeInstanceOf(CollaborationRefusedError);
  await expect(connectToDocument({ server, cookie: owner.cookie, documentId, path, origin: FOREIGN_ORIGIN })).rejects.toBeInstanceOf(
    CollaborationRefusedError,
  );
  expect([worker.mock.calls.length, peek.mock.calls.length, authorize.mock.calls.length]).toEqual([0, 0, 1]);
  client.close();
  await server.stop();
});

test('a room name other than the document own is refused and its idle instance is destroyed', { timeout: SETUP_TIMEOUT_MS }, async () => {
  const { server, documentId, owner, client } = await editedAfterBootstrap({
    versionRoomPolicy: { idleMs: SHORT_IDLE_MS, limit: DEFAULT_LIMIT },
  });
  const other = await bootstrappedDocument({ server, owner });
  const sequence = server.services.readModel.marks(documentId)[0]!.sequence;
  await expect(
    connectToDocument({ server, cookie: owner.cookie, documentId: other.documentId, path: endpointOf({ documentId, sequence }) }),
  ).rejects.toBeInstanceOf(CollaborationRefusedError);
  await expect.poll(() => server.services.versionRooms.size(), { timeout: POLL_TIMEOUT_MS }).toBe(0);
  client.close();
  await server.stop();
});

test('a version endpoint never writes the log, the identities or the room mode', async () => {
  const { server, documentId, owner, client } = await editedAfterBootstrap();
  const sequence = server.services.readModel.marks(documentId).at(-1)!.sequence;
  const roomModeOf = async (): Promise<RoomMode> =>
    (
      (await (
        await fetch(`${server.baseUrl}${documentApiPath({ documentId })}`, { headers: { cookie: owner.cookie } })
      ).json()) as OpenedDocument
    ).roomMode;
  const before = {
    updates: server.services.updateLog.readBatch({ documentName: documentId, afterSequence: 0, limit: 1000 }).length,
    identities: server.services.updateLog.clientIdentities(documentId).size,
    marks: server.services.readModel.marks(documentId).length,
    roomMode: await roomModeOf(),
  };
  const path = endpointOf({ documentId, sequence });
  const writer = await connectToDocument({ server, cookie: owner.cookie, documentId, path });
  writer.provider.setAwarenessField('userId', owner.id);
  writer.document.getText('t').insert(0, 'dropped');
  const observer = await connectToDocument({ server, cookie: owner.cookie, documentId, path });
  await expect.poll(() => writer.document.getText('t').toString(), { timeout: POLL_TIMEOUT_MS }).toBe('dropped');
  expect(observer.document.getText('t').toString()).toBe('');
  const after = {
    updates: server.services.updateLog.readBatch({ documentName: documentId, afterSequence: 0, limit: 1000 }).length,
    identities: server.services.updateLog.clientIdentities(documentId).size,
    marks: server.services.readModel.marks(documentId).length,
    roomMode: await roomModeOf(),
  };
  expect(after).toEqual(before);
  [writer, observer, client].forEach((connected) => connected.close());
  await server.stop();
});

test('an idle version instance is destroyed', async () => {
  const { server, documentId, owner, client } = await editedAfterBootstrap({
    versionRoomPolicy: { idleMs: SHORT_IDLE_MS, limit: DEFAULT_LIMIT },
  });
  const sequence = server.services.readModel.marks(documentId)[0]!.sequence;
  const viewer = await connectToDocument({ server, cookie: owner.cookie, documentId, path: endpointOf({ documentId, sequence }) });
  expect(server.services.versionRooms.size()).toBe(1);
  viewer.close();
  await expect.poll(() => server.services.versionRooms.size(), { timeout: POLL_TIMEOUT_MS }).toBe(0);
  client.close();
  await server.stop();
});

test('the limit evicts the least recently used instance', { timeout: SETUP_TIMEOUT_MS }, async () => {
  const { server, documentId, owner, client } = await editedAfterBootstrap({
    versionRoomPolicy: { idleMs: LONG_IDLE_MS, limit: ROOM_LIMIT },
  });
  const second = await bootstrappedDocument({ server, owner });
  const third = await bootstrappedDocument({ server, owner });
  const first = { documentId, sequence: server.services.readModel.marks(documentId)[0]!.sequence };
  const [firstViewer] = [await connectToDocument({ server, cookie: owner.cookie, documentId: first.documentId, path: endpointOf(first) })];
  const closed = vi.fn();
  firstViewer.provider.on('close', closed);
  const viewers = await Promise.all(
    [second, third].map((target) =>
      connectToDocument({ server, cookie: owner.cookie, documentId: target.documentId, path: endpointOf(target) }),
    ),
  );
  await expect.poll(() => closed.mock.calls.length, { timeout: POLL_TIMEOUT_MS }).toBeGreaterThan(0);
  expect(server.services.versionRooms.size()).toBe(ROOM_LIMIT);
  [firstViewer, ...viewers, client].forEach((connected) => connected.close());
  await server.stop();
});

test('parseVersionPath accepts a version endpoint and refuses everything else', () => {
  const documentId = randomUUID();
  const base = `${ApiPath.Collaboration}/versions/${documentId}`;
  expect(parseVersionPath(`${base}/42`)).toEqual({ documentId, sequence: 42 });
  ['0', '-1', '1.5', '42/x', 'abc', ''].forEach((tail) => expect(parseVersionPath(`${base}/${tail}`)).toBeNull());
  expect(parseVersionPath(`${ApiPath.Collaboration}/versions/not-a-uuid/42`)).toBeNull();
  expect(parseVersionPath(ApiPath.Collaboration)).toBeNull();
});

test('an upgrade on a refused version path is destroyed like an unknown path', async () => {
  const { server, documentId, owner, client } = await editedAfterBootstrap();
  await expect(
    connectToDocument({ server, cookie: owner.cookie, documentId, path: endpointOf({ documentId, sequence: 0 }) }),
  ).rejects.toBeInstanceOf(CollaborationRefusedError);
  client.close();
  await server.stop();
});

test('stop clears its timeout when destroying a room fails', { timeout: SETUP_TIMEOUT_MS }, async () => {
  const { server, documentId, owner, client } = await editedAfterBootstrap();
  const [mark] = server.services.readModel.marks(documentId);
  const viewer = await connectToDocument({
    server,
    cookie: owner.cookie,
    documentId,
    path: endpointOf({ documentId, sequence: mark!.sequence }),
  });
  const rooms = server.services.versionRooms as unknown as { destroy: (key: string) => Promise<void> };
  const destroy = vi.spyOn(rooms, 'destroy').mockRejectedValue(new Error(DESTROY_FAILURE));
  const scheduled = vi.spyOn(globalThis, 'setTimeout');
  const cleared = vi.spyOn(globalThis, 'clearTimeout');
  await expect(server.services.versionRooms.stop()).rejects.toThrow(DESTROY_FAILURE);
  const stopIndex = scheduled.mock.calls.findIndex(([, delay]) => delay === STOP_TIMEOUT_MS);
  expect(stopIndex).toBeGreaterThanOrEqual(0);
  expect(cleared).toHaveBeenCalledWith(scheduled.mock.results[stopIndex]!.value);
  scheduled.mockRestore();
  cleared.mockRestore();
  destroy.mockRestore();
  viewer.close();
  client.close();
  await server.stop();
});
