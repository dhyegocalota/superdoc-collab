import { commitBootstrap as markBootstrapCommitted } from '@superdoc-collab/history/testing';
import { anonymousViewerOf, ClientActor, publicUserIdOf } from '@superdoc-collab/types';
import * as Y from 'yjs';
import { expect, test } from 'vitest';
import { connectAsVisitor, connectToDocument } from '../testing/collaboration-client';
import { publicRoom, roomConnections, visitorToken } from '../testing/public-room';
import type { TestServer } from '../testing/test-server';
import type { CollaborationContext } from './collaboration-context';
import { SUPERDOC_ROOM_PREFIX } from './room-name';

const TEXT_FIELD = 't';
const OWNER_TEXT = 'written by the owner';
const VISITOR_TEXT = 'written by the visitor';
const AWARENESS_FIELD = 'user';

function roomText({ server, documentId }: { server: TestServer; documentId: string }): string {
  const room = server.services.hocuspocus.documents.get(`${SUPERDOC_ROOM_PREFIX}${documentId}`);
  if (!room) throw new Error('The room is not loaded.');
  return room.getText(TEXT_FIELD).toString();
}

function loggedUserIds({ server, documentId }: { server: TestServer; documentId: string }): string[] {
  return server.services.updateLog
    .read({ documentName: documentId, untilSequence: Number.MAX_SAFE_INTEGER })
    .map((update) => update.connectionUserId);
}

test('an update from a public connection is never applied to the room nor appended to the log', async () => {
  const { server, documentId, owner } = await publicRoom();
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId, bootstrapToken: null });
  const visitor = await connectAsVisitor({ server, token: await visitorToken({ server, documentId }), documentId });
  const rowsBefore = loggedUserIds({ server, documentId });
  visitor.document.getText(TEXT_FIELD).insert(0, VISITOR_TEXT);
  ownerClient.document.getText(TEXT_FIELD).insert(0, OWNER_TEXT);
  await expect.poll(() => loggedUserIds({ server, documentId }).length).toBeGreaterThan(rowsBefore.length);
  await expect.poll(() => visitor.document.getText(TEXT_FIELD).toString()).toContain(OWNER_TEXT);
  expect(roomText({ server, documentId })).toBe(OWNER_TEXT);
  expect(ownerClient.document.getText(TEXT_FIELD).toString()).toBe(OWNER_TEXT);
  expect(loggedUserIds({ server, documentId }).filter((userId) => userId.startsWith(publicUserIdOf('')))).toEqual([]);
  [ownerClient, visitor].forEach((client) => client.close());
  await server.stop();
});

test('a change that reaches the room with a visitor context is not appended to the log', async () => {
  const { server, documentId } = await publicRoom();
  const document = new Y.Doc();
  markBootstrapCommitted(document);
  document.getText(TEXT_FIELD).insert(0, VISITOR_TEXT);
  const context: CollaborationContext = {
    userId: publicUserIdOf('visitor-1'),
    documentId,
    actor: ClientActor.Human,
    bootstrapAttempt: null,
    holdsRoomPlace: false,
    tabId: null,
    impersonationEndsAt: null,
    visitor: anonymousViewerOf('visitor-1'),
  };
  const { onChange } = server.services.hocuspocus.configuration;
  const rowsBefore = loggedUserIds({ server, documentId });
  await onChange?.({
    update: Y.encodeStateAsUpdate(document),
    context,
    document,
    documentName: `${SUPERDOC_ROOM_PREFIX}${documentId}`,
    transactionOrigin: {},
  } as unknown as Parameters<NonNullable<typeof onChange>>[0]);
  expect(loggedUserIds({ server, documentId })).toEqual(rowsBefore);
  await server.stop();
});

test('a visitor announces no awareness to the room while it sees the awareness of a member', async () => {
  const { server, documentId, owner } = await publicRoom();
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId, bootstrapToken: null });
  const visitor = await connectAsVisitor({ server, token: await visitorToken({ server, documentId }), documentId });
  visitor.provider.setAwarenessField(AWARENESS_FIELD, { name: 'Anonymous Fox' });
  ownerClient.provider.setAwarenessField(AWARENESS_FIELD, { name: 'Ana' });
  await expect.poll(() => visitor.provider.awareness?.getStates().has(ownerClient.document.clientID)).toBe(true);
  expect(ownerClient.provider.awareness?.getStates().has(visitor.document.clientID)).toBe(false);
  [ownerClient, visitor].forEach((client) => client.close());
  await server.stop();
});
