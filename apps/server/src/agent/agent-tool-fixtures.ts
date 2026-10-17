import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { AgentScope, type AgentActionKind } from '@superdoc-history/types';
import type { SuperDocDocument } from '@superdoc/sdk';
import { vi } from 'vitest';
import type { TestServer } from '../testing/test-server';
import type { AgentDocumentSessions, AgentToolContext } from './agent-tool-context';

export const ALL_AGENT_SCOPES = Object.values(AgentScope);
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
