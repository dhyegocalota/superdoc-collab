import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { HttpStatus, MINUTE_MS, secondsRoundedUp } from '@superdoc-collab/types';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { KeyedSlidingWindow } from '../limits/keyed-sliding-window';
import type { AppServices } from '../http/app';
import { retryLater } from '../http/retry-later';
import type { AgentDocumentSessions, AgentToolContext, AgentToolPrincipal, RecordAgentAction } from './agent-tool-context';
import { AGENT_TOOLS, agentToolsFor, callAgentTool } from './agent-tools';

export const MCP_BODY_MAX_BYTES = 256 * 1024;
export const MCP_RATE_LIMIT: McpRateLimit = { maxCalls: 120, windowMs: MINUTE_MS };
const RATE_LIMITED_MESSAGE = 'Too many requests; slow down';
const BATCH_REFUSED_MESSAGE = 'JSON-RPC batches are not supported; send one message per request';
const REQUEST_TOO_LARGE_MESSAGE = 'The request body is too large';
const MCP_SERVER_NAME = 'superdoc-history';
const MCP_SERVER_VERSION = '1.0.0';
const ALLOWED_METHOD_HEADER = { Allow: 'POST' };

export type McpRateLimit = { maxCalls: number; windowMs: number };

export type McpRouteOptions = {
  appOrigin: string;
  rateLimit?: McpRateLimit;
  services: AppServices;
  authorize: (request: Request) => Promise<AgentToolPrincipal | null>;
  unauthorized: () => Response;
  sessions: AgentDocumentSessions;
  toolkit: AgentToolContext['toolkit'];
  recordAction: RecordAgentAction;
};

function createMcpServer(context: AgentToolContext): McpServer {
  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION });
  agentToolsFor(context.principal.scopes).forEach((tool) => {
    const { description, inputSchema, annotations } = AGENT_TOOLS[tool];
    server.registerTool(tool, { description, inputSchema, annotations }, (input) => callAgentTool({ tool, input, context }));
  });
  return server;
}

export function createMcpRoutes({
  appOrigin,
  rateLimit = MCP_RATE_LIMIT,
  services,
  authorize,
  unauthorized,
  sessions,
  toolkit,
  recordAction,
}: McpRouteOptions): Hono {
  const routes = new Hono();
  const calls = new KeyedSlidingWindow({ windowMs: rateLimit.windowMs, maxEvents: rateLimit.maxCalls });
  routes.post(
    '/',
    bodyLimit({
      maxSize: MCP_BODY_MAX_BYTES,
      onError: (honoContext) => honoContext.json({ error: REQUEST_TOO_LARGE_MESSAGE }, HttpStatus.PayloadTooLarge),
    }),
    async (honoContext) => {
      const principal = await authorize(honoContext.req.raw);
      if (!principal) return unauthorized();
      const waitMs = calls.waitMs(principal.userId);
      if (waitMs !== null) {
        return retryLater({
          context: honoContext,
          body: { error: RATE_LIMITED_MESSAGE },
          status: HttpStatus.TooManyRequests,
          retryAfterSeconds: secondsRoundedUp(waitMs),
        });
      }
      calls.record(principal.userId);
      const body: unknown = await honoContext.req.raw
        .clone()
        .json()
        .catch(() => null);
      if (Array.isArray(body)) return honoContext.json({ error: BATCH_REFUSED_MESSAGE }, HttpStatus.BadRequest);
      if (agentToolsFor(principal.scopes).length === 0) return honoContext.body(null, HttpStatus.Forbidden);
      const server = createMcpServer({ appOrigin, services, principal, sessions, toolkit, recordAction });
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      try {
        return await transport.handleRequest(honoContext.req.raw);
      } finally {
        await server.close();
      }
    },
  );
  routes.on(['GET', 'DELETE'], '/', (honoContext) => honoContext.body(null, HttpStatus.MethodNotAllowed, ALLOWED_METHOD_HEADER));
  return routes;
}
