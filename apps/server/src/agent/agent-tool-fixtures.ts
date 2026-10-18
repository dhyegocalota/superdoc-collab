import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Hocuspocus } from '@hocuspocus/server';
import { buildSeedDocx, isBootstrapCommitted } from '@superdoc-collab/history';
import { AgentScope, ClientActor, RoomMode, type AgentActionKind } from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import { createSuperDocClient, type SuperDocDocument } from '@superdoc/sdk';
import type { AddressInfo } from 'node:net';
import { vi } from 'vitest';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import { SUPERDOC_ROOM_PREFIX } from '../collaboration/room-name';
import type { TestServer, TestUser } from '../testing/test-server';
import type { AgentDocumentSessions, AgentToolContext } from './agent-tool-context';

export const ALL_AGENT_SCOPES = Object.values(AgentScope);
export const TOOL_APP_ORIGIN = 'http://app.test';
const SEED_TEXT = 'Budget is approved.';
const SEED_TITLE = 'Plan';
const PROJECTION_TIMEOUT_MS = 15_000;
const SEED_PERSON_NAME = 'Seed';
const SEED_RUNTIME = 'v2';
const SEED_PROVIDER = 'hocuspocus';
const SEED_TOKEN = 'seed-token';
const SEED_LOCALHOST = 'ws://127.0.0.1';
const UNEXPECTED_SESSION_MESSAGE = 'No document session is expected here';

export type RecordedAgentAction = { documentId: string; userId: string; kind: AgentActionKind };

export function sessionsOn(document: object): AgentDocumentSessions {
  return { run: ({ work }) => work(document as SuperDocDocument) };
}

const refusingSessions: AgentDocumentSessions = {
  run: () => Promise.reject(new Error(UNEXPECTED_SESSION_MESSAGE)),
};

export function toolContext({
  server,
  userId,
  scopes = ALL_AGENT_SCOPES,
  sessions = refusingSessions,
  dispatch = vi.fn(),
}: {
  server: TestServer;
  userId: string;
  scopes?: AgentScope[];
  sessions?: AgentDocumentSessions;
  dispatch?: AgentToolContext['toolkit']['dispatch'];
}): { context: AgentToolContext; recorded: RecordedAgentAction[] } {
  const recorded: RecordedAgentAction[] = [];
  const context: AgentToolContext = {
    appOrigin: TOOL_APP_ORIGIN,
    services: server.services,
    principal: { userId, scopes },
    sessions,
    toolkit: { dispatch },
    recordAction: (action) => recorded.push(action),
  };
  return { context, recorded };
}

export function resultText(result: CallToolResult): string {
  const [content] = result.content;
  if (!content || content.type !== 'text') throw new Error('The tool result has no text content');
  return content.text;
}

export function resultJson(result: CallToolResult): unknown {
  return JSON.parse(resultText(result));
}

async function commitSeededRoom({ server, owner, documentId }: { server: TestServer; owner: TestUser; documentId: string }): Promise<void> {
  const seedRoom = new Hocuspocus({ quiet: true });
  const sockets = new WebSocketServer({ port: 0 });
  sockets.on('connection', (socket, request) => seedRoom.handleConnection(socket, request));
  const { port } = sockets.address() as AddressInfo;
  const client = createSuperDocClient({ user: { name: SEED_PERSON_NAME, email: owner.email } });
  await client.connect();
  const seeding = await client.open(
    {
      runtime: SEED_RUNTIME,
      doc: server.services.storage.pathOf(documentId),
      userName: SEED_PERSON_NAME,
      userEmail: owner.email,
      collaboration: { providerType: SEED_PROVIDER, url: `${SEED_LOCALHOST}:${port}`, documentId, roomMode: RoomMode.Create },
    },
    { collaborationAuth: { type: 'token', token: SEED_TOKEN } },
  );
  const room = seedRoom.documents.get(`${SUPERDOC_ROOM_PREFIX}${documentId}`);
  if (!room || !isBootstrapCommitted({ document: room })) throw new Error(`The seed room of ${documentId} did not commit.`);
  const state = Y.encodeStateAsUpdate(room);
  server.services.updateLog.appendCommitted({
    documentName: documentId,
    connectionUserId: owner.id,
    connectionActor: ClientActor.Human,
    update: state,
    state,
  });
  server.services.throttle.request(documentId);
  await vi.waitFor(
    () => {
      if (server.services.readModel.cursor(documentId) === null) throw new Error(`The projection of ${documentId} has not started.`);
    },
    { timeout: PROJECTION_TIMEOUT_MS },
  );
  await seeding.close({ discard: true });
  await client.dispose();
  await seedRoom.destroy();
  await new Promise((resolve) => sockets.close(resolve));
}

export async function seededDocument({
  server,
  owner,
  text = SEED_TEXT,
}: {
  server: TestServer;
  owner: TestUser;
  text?: string;
}): Promise<string> {
  const documentId = randomUUID();
  server.services.documents.create({ id: documentId, title: SEED_TITLE, ownerUserId: owner.id });
  await server.services.storage.put({ documentId, bytes: await buildSeedDocx([{ text, trackedChanges: [] }]) });
  await commitSeededRoom({ server, owner, documentId });
  server.services.runtime.importRevisions(documentId);
  return documentId;
}
