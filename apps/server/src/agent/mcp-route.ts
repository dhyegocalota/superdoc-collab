import { Hono } from 'hono';
import type { AppServices } from '../http/app';
import type { AgentDocumentSessions, AgentToolContext, AgentToolPrincipal, RecordAgentAction } from './agent-tool-context';

export const METHOD_NOT_ALLOWED_STATUS = 405;

export type McpRouteOptions = {
  services: AppServices;
  authorize: (request: Request) => Promise<AgentToolPrincipal | null>;
  unauthorized: () => Response;
  sessions: AgentDocumentSessions;
  toolkit: AgentToolContext['toolkit'];
  recordAction: RecordAgentAction;
};

export function createMcpRoutes(_options: McpRouteOptions): Hono {
  return new Hono();
}
