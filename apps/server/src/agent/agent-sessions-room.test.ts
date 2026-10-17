import { ApiPath, DOCUMENT_NOT_READY_ERROR, DocumentRole, RoomMode } from '@superdoc-collab/types';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { AgentSessions } from './agent-sessions';
import { ROOM_TOKEN_TTL_MS, signRoomToken } from './room-tokens';
import { TEST_AUTH_SECRET } from '../testing/test-server';
import { signedInOwner, signedInUser, type TestServer, type TestUser } from '../testing/test-server';
import { AgentToolError } from './tool-results';
import type { AgentPerson } from './agent-tool-context';
import { seededDocument } from './agent-tool-fixtures';

const OWNER_AGENT_NAME = 'Ana · AI';
const READER_NAME = 'Reader';
const SECOND_NAME = 'Bruno';
const SECOND_AGENT_NAME = 'Bruno · AI';
const FIRST_EDIT = { find: 'Budget', replace: 'Plan' };
const SECOND_EDIT = { find: 'approved', replace: 'pending' };
const PERFORM_ACTION = 'superdoc_perform_action';
const REPLACE_TEXT = 'replace_text';
const TRACKED = 'tracked';
const SHORT_TOKEN_LIFETIME_MS = 3000;
const SHORT_OPEN_TIMEOUT_MS = 1500;
const EXPIRY_POLL_MS = 6000;
const LOGGED_UPDATES_LIMIT = 100_000;
const ABOUT_TO_EXPIRE = { find: 'Budget', replace: 'Plan' };
const sessionsToClose: AgentSessions[] = [];

let server: TestServer;
let owner: TestUser;
let second: TestUser;
let reader: TestUser;
let documentId: string;

function personOf(user: TestUser, name: string): AgentPerson {
  return { userId: user.id, name, email: user.email };
}

beforeAll(async () => {
  ({ server, owner } = await signedInOwner());
  documentId = await seededDocument({ server, owner });
  second = await signedInUser({ server, name: SECOND_NAME });
  server.services.documents.grant({ documentId, userId: second.id, role: DocumentRole.Editor });
  reader = await signedInUser({ server, name: READER_NAME });
  server.services.documents.grant({ documentId, userId: reader.id, role: DocumentRole.Reader });
});

afterAll(async () => {
  await Promise.all(sessionsToClose.map((sessions) => sessions.close()));
  await server.stop();
});

function replaceAs({ user, name, edit }: { user: TestUser; name: string; edit: { find: string; replace: string } }): Promise<unknown> {
  return server.services.agentSessions.run({
    person: personOf(user, name),
    documentId,
    work: (document) =>
      server.services.agentToolkit.dispatch(document, PERFORM_ACTION, { action: REPLACE_TEXT, edits: [edit], changeMode: TRACKED }),
  });
}

test('a session opened for Ana signs tracked changes as Ana · AI', async () => {
  await replaceAs({ user: owner, name: 'Ana', edit: FIRST_EDIT });
  const listed = await server.services.agentSessions.run({
    person: personOf(reader, READER_NAME),
    documentId,
    work: (document) => document.trackChanges.list({}),
  });
  expect(JSON.stringify(listed)).toContain(OWNER_AGENT_NAME);
});

test('a second person on the same host keeps their own name', async () => {
  await replaceAs({ user: second, name: SECOND_NAME, edit: SECOND_EDIT });
  const listed = JSON.stringify(
    await server.services.agentSessions.run({
      person: personOf(reader, READER_NAME),
      documentId,
      work: (document) => document.trackChanges.list({}),
    }),
  );
  expect(listed).toContain(OWNER_AGENT_NAME);
  expect(listed).toContain(SECOND_AGENT_NAME);
});

function loggedUpdates(roomId: string): number {
  return server.services.updateLog.readBatch({ documentName: roomId, afterSequence: 0, limit: LOGGED_UPDATES_LIMIT }).length;
}

function sessionsWith({
  roomMode = RoomMode.Join,
  tokenIssuedAt = () => Date.now(),
  tokenLifetimeMs,
  openTimeoutMs,
}: {
  roomMode?: RoomMode;
  tokenIssuedAt?: () => number;
  tokenLifetimeMs?: number;
  openTimeoutMs?: number;
}): AgentSessions {
  const sessions = new AgentSessions({
    issueRoomToken: ({ userId, documentId: roomId }) =>
      signRoomToken({ secret: TEST_AUTH_SECRET, userId, documentId: roomId, now: tokenIssuedAt() }),
    collaborationUrl: () => `${server.baseUrl.replace('http', 'ws')}${ApiPath.AgentCollaboration}`,
    locateRoom: (roomId) => ({ roomMode }),
    roleOf: ({ userId, documentId: roomId }) => server.services.documents.findRole({ documentId: roomId, userId }),
    tokenLifetimeMs,
    openTimeoutMs,
  });
  sessionsToClose.push(sessions);
  return sessions;
}

function editThrough({
  sessions,
  user,
  name,
  roomId,
}: {
  sessions: AgentSessions;
  user: TestUser;
  name: string;
  roomId: string;
}): Promise<unknown> {
  return sessions.run({
    person: personOf(user, name),
    documentId: roomId,
    work: (document) =>
      server.services.agentToolkit.dispatch(document, PERFORM_ACTION, {
        action: REPLACE_TEXT,
        edits: [ABOUT_TO_EXPIRE],
        changeMode: TRACKED,
      }),
  });
}

async function roomCreatedByOwner(): Promise<string> {
  const roomId = await seededDocument({ server, owner });
  await server.services.agentSessions.run({
    person: personOf(owner, 'Ana'),
    documentId: roomId,
    work: (document) => server.services.agentToolkit.dispatch(document, 'superdoc_inspect', {}),
  });
  return roomId;
}

test('a Reader promoted to Editor while the session is cached has the next edit logged', async () => {
  const roomId = await roomCreatedByOwner();
  const promoted = await signedInUser({ server, name: 'Pat' });
  server.services.documents.grant({ documentId: roomId, userId: promoted.id, role: DocumentRole.Reader });
  const sessions = sessionsWith({});
  await editThrough({ sessions, user: promoted, name: 'Pat', roomId }).catch(() => undefined);
  server.services.documents.grant({ documentId: roomId, userId: promoted.id, role: DocumentRole.Editor });
  const before = loggedUpdates(roomId);
  await editThrough({ sessions, user: promoted, name: 'Pat', roomId });
  await vi.waitFor(() => expect(loggedUpdates(roomId)).toBeGreaterThan(before));
});

test('a session near the end of its room token is replaced, so an edit after a reconnect is logged', async () => {
  const roomId = await roomCreatedByOwner();
  const sessions = sessionsWith({
    tokenIssuedAt: () => Date.now() - ROOM_TOKEN_TTL_MS + SHORT_TOKEN_LIFETIME_MS,
    tokenLifetimeMs: SHORT_TOKEN_LIFETIME_MS,
    openTimeoutMs: SHORT_OPEN_TIMEOUT_MS,
  });
  await editThrough({ sessions, user: owner, name: 'Ana', roomId });
  const signedAt = Date.now();
  await vi.waitFor(() => expect(Date.now() - signedAt).toBeGreaterThan(SHORT_TOKEN_LIFETIME_MS + 200), { timeout: EXPIRY_POLL_MS });
  server.services.hocuspocus.closeConnections();
  const before = loggedUpdates(roomId);
  await editThrough({ sessions, user: owner, name: 'Ana', roomId });
  await vi.waitFor(() => expect(loggedUpdates(roomId)).toBeGreaterThan(before));
});

test('an agent opening an uncommitted room is answered NOT_READY and seeds nothing', async () => {
  const roomId = await seededDocument({ server, owner });
  const refused = await editThrough({ sessions: sessionsWith({ roomMode: RoomMode.Create }), user: owner, name: 'Ana', roomId }).catch(
    (error: unknown) => error,
  );
  expect(refused).toBeInstanceOf(AgentToolError);
  expect((refused as AgentToolError).message).toBe(DOCUMENT_NOT_READY_ERROR);
  expect(loggedUpdates(roomId)).toBe(0);
});
