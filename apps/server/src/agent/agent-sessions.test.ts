import { agentAuthorName, DocumentRole, RoomMode } from '@superdoc-collab/types';
import type { SuperDocDocument } from '@superdoc/sdk';
import { afterEach, expect, test, vi } from 'vitest';
import { AgentSessionBusyError, AgentSessionOpenTimeoutError, AgentSessions, type AgentSessionsClient } from './agent-sessions';
import type { AgentPerson } from './agent-tool-context';

const COLLABORATION_URL = 'ws://127.0.0.1:1/collaboration/agent';
const FILE_PATH = '/documents/file.docx';
const ROOM_TOKEN = 'room-token';
const SHORT_MS = 30;
const TOKEN_LIFETIME_MS = 1000;
const OPEN_TIMEOUT_MS = 100;
const ANA: AgentPerson = { userId: 'ana', name: 'Ana', email: 'ana@example.com' };
const BRUNO: AgentPerson = { userId: 'bruno', name: 'Bruno', email: 'bruno@example.com' };

type FakeDocument = { name: string; close: ReturnType<typeof vi.fn> };

function fakeClient(openDocument: (parameters: Parameters<AgentSessionsClient['open']>) => Promise<SuperDocDocument>) {
  const client = {
    connect: vi.fn(async () => undefined),
    open: vi.fn((...parameters: Parameters<AgentSessionsClient['open']>) => openDocument(parameters)),
    dispose: vi.fn(async () => undefined),
  };
  return client satisfies AgentSessionsClient;
}

function documentNamed(name: string): FakeDocument {
  return { name, close: vi.fn(async () => undefined) };
}

function sessionsOn({
  client,
  roomMode = RoomMode.Join,
  role = { current: DocumentRole.Editor },
  ...limits
}: {
  client: AgentSessionsClient;
  roomMode?: RoomMode;
  role?: { current: DocumentRole };
  maxSessions?: number;
  idleMs?: number;
  openTimeoutMs?: number;
  now?: () => number;
  tokenLifetimeMs?: number;
}): AgentSessions {
  return new AgentSessions({
    issueRoomToken: () => ROOM_TOKEN,
    collaborationUrl: () => COLLABORATION_URL,
    locateRoom: () => ({ roomMode, filePath: FILE_PATH }),
    roleOf: () => role.current,
    createClient: () => client,
    ...limits,
  });
}

function openedPerDocument() {
  const opened = new Map<string, FakeDocument>();
  const replaced: FakeDocument[] = [];
  const client = fakeClient(async ([parameters]) => {
    const documentId = (parameters.collaboration as { documentId: string }).documentId;
    const document = documentNamed(documentId);
    const previous = opened.get(documentId);
    if (previous) replaced.push(previous);
    opened.set(documentId, document);
    return document as unknown as SuperDocDocument;
  });
  return { client, opened, replaced };
}

afterEach(() => {
  vi.useRealTimers();
});

test('a session opens the live room as the person with a room token and the agent author name', async () => {
  const { client } = openedPerDocument();
  const sessions = sessionsOn({ client });
  await sessions.run({ person: ANA, documentId: 'plan', work: async () => undefined });
  expect(client.connect).toHaveBeenCalledTimes(1);
  expect(client.open).toHaveBeenCalledWith(
    {
      runtime: 'v2',
      userName: agentAuthorName(ANA.name),
      userEmail: ANA.email,
      collaboration: { providerType: 'hocuspocus', url: COLLABORATION_URL, documentId: 'plan', roomMode: RoomMode.Join },
    },
    { collaborationAuth: { type: 'token', token: ROOM_TOKEN } },
  );
  await sessions.close();
});

test('a document nobody has opened is created from its stored file', async () => {
  const { client } = openedPerDocument();
  const sessions = sessionsOn({ client, roomMode: RoomMode.Create });
  await sessions.run({ person: ANA, documentId: 'plan', work: async () => undefined });
  expect(client.open).toHaveBeenCalledWith(
    expect.objectContaining({ doc: FILE_PATH, collaboration: expect.objectContaining({ roomMode: RoomMode.Create }) }),
    expect.anything(),
  );
  await sessions.close();
});

test('the same person and document reuse one session, another person gets their own', async () => {
  const { client } = openedPerDocument();
  const sessions = sessionsOn({ client });
  const work = async (document: SuperDocDocument) => (document as unknown as FakeDocument).name;
  await sessions.run({ person: ANA, documentId: 'plan', work });
  await sessions.run({ person: ANA, documentId: 'plan', work });
  expect(client.open).toHaveBeenCalledTimes(1);
  await sessions.run({ person: BRUNO, documentId: 'plan', work });
  expect(client.open).toHaveBeenCalledTimes(2);
  expect(client.open.mock.calls.map(([parameters]) => parameters.userName)).toEqual([agentAuthorName('Ana'), agentAuthorName('Bruno')]);
  await sessions.close();
});

test('the least recently used idle session closes at the cap', async () => {
  const { client, opened } = openedPerDocument();
  const sessions = sessionsOn({ client, maxSessions: 2 });
  const touch = (documentId: string) => sessions.run({ person: ANA, documentId, work: async () => undefined });
  await touch('first');
  await touch('second');
  await touch('first');
  await touch('third');
  expect(opened.get('second')!.close).toHaveBeenCalledTimes(1);
  expect(opened.get('first')!.close).not.toHaveBeenCalled();
  expect(opened.get('third')!.close).not.toHaveBeenCalled();
  await sessions.close();
});

test('a session with a call in flight is never evicted', async () => {
  const { client, opened } = openedPerDocument();
  const sessions = sessionsOn({ client, maxSessions: 2 });
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const inFlight = sessions.run({ person: ANA, documentId: 'busy', work: () => gate });
  await vi.waitFor(() => expect(opened.has('busy')).toBe(true));
  await sessions.run({ person: BRUNO, documentId: 'other', work: async () => undefined });
  await sessions.run({ person: BRUNO, documentId: 'another', work: async () => undefined });
  expect(opened.get('busy')!.close).not.toHaveBeenCalled();
  release();
  await inFlight;
  expect(opened.get('other')!.close).toHaveBeenCalledTimes(1);
  await sessions.close();
});

test('calls on one session run one after the other over a single open', async () => {
  const { client } = openedPerDocument();
  const sessions = sessionsOn({ client });
  const order: string[] = [];
  const slow = sessions.run({
    person: ANA,
    documentId: 'plan',
    work: async () => {
      order.push('slow:start');
      await new Promise((resolve) => setTimeout(resolve, SHORT_MS));
      order.push('slow:end');
    },
  });
  const quick = sessions.run({ person: ANA, documentId: 'plan', work: async () => order.push('quick') });
  await Promise.all([slow, quick]);
  expect(order).toEqual(['slow:start', 'slow:end', 'quick']);
  expect(client.open).toHaveBeenCalledTimes(1);
  await sessions.close();
});

test('a session that does not open in time is closed and the call fails, and the next call opens again', async () => {
  const late: { resolve: (document: SuperDocDocument) => void } = { resolve: () => undefined };
  const lateDocument = documentNamed('late');
  const client = fakeClient(
    () =>
      new Promise<SuperDocDocument>((resolve) => {
        late.resolve = resolve;
      }),
  );
  const sessions = sessionsOn({ client, openTimeoutMs: SHORT_MS });
  await expect(sessions.run({ person: ANA, documentId: 'plan', work: async () => undefined })).rejects.toBeInstanceOf(
    AgentSessionOpenTimeoutError,
  );
  late.resolve(lateDocument as unknown as SuperDocDocument);
  await vi.waitFor(() => expect(lateDocument.close).toHaveBeenCalledTimes(1));
  await expect(sessions.run({ person: ANA, documentId: 'plan', work: async () => undefined })).rejects.toBeInstanceOf(
    AgentSessionOpenTimeoutError,
  );
  expect(client.open).toHaveBeenCalledTimes(2);
  await sessions.close();
});

test('a call that fails closes its session, the error reaches the caller and the next call opens again', async () => {
  const { client, opened } = openedPerDocument();
  const sessions = sessionsOn({ client });
  await expect(
    sessions.run({
      person: ANA,
      documentId: 'plan',
      work: async () => {
        throw new Error('the room dropped');
      },
    }),
  ).rejects.toThrow('the room dropped');
  expect(opened.get('plan')!.close).toHaveBeenCalledTimes(1);
  await sessions.run({ person: ANA, documentId: 'plan', work: async () => undefined });
  expect(client.open).toHaveBeenCalledTimes(2);
  await sessions.close();
});

test('an idle session closes after the idle time', async () => {
  const { client, opened } = openedPerDocument();
  const sessions = sessionsOn({ client, idleMs: SHORT_MS });
  await sessions.run({ person: ANA, documentId: 'plan', work: async () => undefined });
  await vi.waitFor(() => expect(opened.get('plan')!.close).toHaveBeenCalledTimes(1));
  await sessions.run({ person: ANA, documentId: 'plan', work: async () => undefined });
  expect(client.open).toHaveBeenCalledTimes(2);
  await sessions.close();
});

test('close closes every idle session and disposes the client', async () => {
  const { client, opened } = openedPerDocument();
  const sessions = sessionsOn({ client });
  await sessions.run({ person: ANA, documentId: 'first', work: async () => undefined });
  await sessions.run({ person: BRUNO, documentId: 'second', work: async () => undefined });
  await sessions.close();
  expect([...opened.values()].map(({ close }) => close.mock.calls.length)).toEqual([1, 1]);
  expect(client.dispose).toHaveBeenCalledTimes(1);
});

test.each([
  { name: 'is still younger than the token lifetime minus the open timeout', ageMs: TOKEN_LIFETIME_MS - OPEN_TIMEOUT_MS - 1, opens: 1 },
  { name: 'reaches the token lifetime minus the open timeout', ageMs: TOKEN_LIFETIME_MS - OPEN_TIMEOUT_MS, opens: 2 },
])('a cached session that $name is reused or replaced', async ({ ageMs, opens }) => {
  const { client, replaced } = openedPerDocument();
  const clock = { current: 0 };
  const sessions = sessionsOn({ client, now: () => clock.current, tokenLifetimeMs: TOKEN_LIFETIME_MS, openTimeoutMs: OPEN_TIMEOUT_MS });
  await sessions.run({ person: ANA, documentId: 'plan', work: async () => undefined });
  clock.current = ageMs;
  await sessions.run({ person: ANA, documentId: 'plan', work: async () => undefined });
  expect(client.open).toHaveBeenCalledTimes(opens);
  expect(replaced.map(({ close }) => close.mock.calls.length)).toEqual(opens === 1 ? [] : [1]);
  await sessions.close();
});

test('a cached session opened under another role is replaced so the room permissions match', async () => {
  const { client, replaced } = openedPerDocument();
  const role = { current: DocumentRole.Reader };
  const sessions = sessionsOn({ client, role });
  await sessions.run({ person: ANA, documentId: 'plan', work: async () => undefined });
  role.current = DocumentRole.Editor;
  await sessions.run({ person: ANA, documentId: 'plan', work: async () => undefined });
  expect(client.open).toHaveBeenCalledTimes(2);
  expect(replaced.map(({ close }) => close.mock.calls.length)).toEqual([1]);
  await sessions.close();
});

test('a cached session opened under another author name is replaced', async () => {
  const { client } = openedPerDocument();
  const sessions = sessionsOn({ client });
  await sessions.run({ person: ANA, documentId: 'plan', work: async () => undefined });
  await sessions.run({ person: { ...ANA, name: 'Ana Lima' }, documentId: 'plan', work: async () => undefined });
  expect(client.open.mock.calls.map(([parameters]) => parameters.userName)).toEqual([agentAuthorName('Ana'), agentAuthorName('Ana Lima')]);
  await sessions.close();
});

test('parallel calls on different documents never hold more rooms than the cap', async () => {
  const { client, opened } = openedPerDocument();
  const sessions = sessionsOn({ client, maxSessions: 1 });
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = sessions.run({ person: ANA, documentId: 'first', work: () => gate });
  await vi.waitFor(() => expect(opened.has('first')).toBe(true));
  const second = sessions.run({ person: ANA, documentId: 'second', work: async () => undefined });
  await new Promise((resolve) => setTimeout(resolve, SHORT_MS));
  expect(client.open).toHaveBeenCalledTimes(1);
  release();
  await Promise.all([first, second]);
  expect(client.open).toHaveBeenCalledTimes(2);
  expect(opened.get('first')!.close).toHaveBeenCalledTimes(1);
  await sessions.close();
});

test('a call that waits longer than the open timeout for a free room fails busy with a retry hint and never runs later', async () => {
  const { client, opened } = openedPerDocument();
  const sessions = sessionsOn({ client, maxSessions: 1, openTimeoutMs: SHORT_MS });
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holder = sessions.run({ person: ANA, documentId: 'first', work: () => gate });
  await vi.waitFor(() => expect(opened.has('first')).toBe(true));
  const work = vi.fn(async () => undefined);
  const refused = await sessions.run({ person: ANA, documentId: 'second', work }).catch((error: unknown) => error);
  expect(refused).toBeInstanceOf(AgentSessionBusyError);
  expect((refused as AgentSessionBusyError).details).toEqual({ retryAfterSeconds: 1 });
  release();
  await holder;
  await sessions.run({ person: ANA, documentId: 'third', work: async () => undefined });
  expect(work).not.toHaveBeenCalled();
  expect(client.open).toHaveBeenCalledTimes(2);
  await sessions.close();
});

test('one person has one active session at a time, so parallel calls on two documents queue', async () => {
  const { client, opened } = openedPerDocument();
  const sessions = sessionsOn({ client });
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = sessions.run({ person: ANA, documentId: 'first', work: () => gate });
  await vi.waitFor(() => expect(opened.has('first')).toBe(true));
  const second = sessions.run({ person: ANA, documentId: 'second', work: async () => undefined });
  const other = await sessions.run({ person: BRUNO, documentId: 'third', work: async () => 'served' });
  expect(other).toBe('served');
  expect(opened.has('second')).toBe(false);
  release();
  await Promise.all([first, second]);
  expect(opened.has('second')).toBe(true);
  await sessions.close();
});

test('a queued call gives up busy after the open timeout and calls behind it keep waiting for the holder', async () => {
  const { client, opened } = openedPerDocument();
  const sessions = sessionsOn({ client, openTimeoutMs: SHORT_MS });
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holder = sessions.run({ person: ANA, documentId: 'first', work: () => gate });
  await vi.waitFor(() => expect(opened.has('first')).toBe(true));
  const work = vi.fn(async () => undefined);
  const secondOutcome = await sessions.run({ person: ANA, documentId: 'second', work }).catch((error: unknown) => error);
  const thirdOutcome = await sessions.run({ person: ANA, documentId: 'third', work }).catch((error: unknown) => error);
  expect([secondOutcome, thirdOutcome].map((outcome) => outcome instanceof AgentSessionBusyError)).toEqual([true, true]);
  release();
  await holder;
  expect(work).not.toHaveBeenCalled();
  expect(opened.has('second')).toBe(false);
  await sessions.close();
});
