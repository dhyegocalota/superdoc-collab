import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { buildSeedDocx } from '@superdoc-collab/history';
import { AgentScope, type AgentActionKind } from '@superdoc-collab/types';
import { randomUUID } from 'node:crypto';
import type { SuperDocDocument } from '@superdoc/sdk';
import { vi } from 'vitest';
import type { TestServer, TestUser } from '../testing/test-server';
import type { AgentDocumentSessions, AgentToolContext } from './agent-tool-context';

export const ALL_AGENT_SCOPES = Object.values(AgentScope);
const SEED_TEXT = 'Budget is approved.';
const SEED_TITLE = 'Plan';
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
  server.services.runtime.importRevisions(documentId);
  return documentId;
}
