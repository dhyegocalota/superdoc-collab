import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AgentScope, AgentTool, ApiPath, DocumentRole, HttpMethod, HttpStatus, type DocumentsList } from '@superdoc-collab/types';
import { Hono } from 'hono';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { documentWithOwner } from '../testing/collaboration-client';
import type { TestServer, TestUser } from '../testing/test-server';
import type { AgentToolPrincipal } from './agent-tool-context';
import { ALL_AGENT_SCOPES, sessionsOn } from './agent-tool-fixtures';
import { createMcpRoutes, MCP_BODY_MAX_BYTES } from './mcp-route';

const APP_ORIGIN = 'http://app.test';
const MCP_URL = `${APP_ORIGIN}${ApiPath.Mcp}`;
const BEARER_PREFIX = 'Bearer ';
const CHALLENGE_HEADER = 'www-authenticate';
const CHALLENGE = 'Bearer resource_metadata="http://app.test/.well-known/oauth-protected-resource"';
const OWNER_TOKEN = 'owner-token';
const HISTORY_ONLY_TOKEN = 'history-only-token';
const NO_SCOPE_TOKEN = 'no-scope-token';
const FIRST_TOOL_CALL = 1;
const SECOND_TOOL_CALL = 2;

let server: TestServer;
let documentId: string;
let owner: TestUser;
let app: Hono;
const clients: Client[] = [];

beforeAll(async () => {
  ({ server, documentId, owner } = await documentWithOwner());
  const principals = new Map<string, AgentToolPrincipal>([
    [OWNER_TOKEN, { userId: owner.id, scopes: ALL_AGENT_SCOPES }],
    [HISTORY_ONLY_TOKEN, { userId: owner.id, scopes: [AgentScope.HistoryRead] }],
    [NO_SCOPE_TOKEN, { userId: owner.id, scopes: [] }],
  ]);
  app = new Hono().route(
    ApiPath.Mcp,
    createMcpRoutes({
      services: server.services,
      authorize: async (request) => {
        const header = request.headers.get('authorization');
        if (!header) return null;
        const principal = principals.get(header.slice(BEARER_PREFIX.length));
        if (!principal) return null;
        return principal;
      },
      unauthorized: () => new Response(null, { status: HttpStatus.Unauthorized, headers: { [CHALLENGE_HEADER]: CHALLENGE } }),
      sessions: sessionsOn({}),
      toolkit: { dispatch: async () => ({}) },
      recordAction: () => undefined,
    }),
  );
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.close()));
  await server.stop();
});

async function connect(token: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { authorization: `${BEARER_PREFIX}${token}` } },
    fetch: (input, init) => Promise.resolve(app.fetch(new Request(input, init))),
  });
  const client = new Client({ name: 'route-test', version: '0.0.0' });
  clients.push(client);
  await client.connect(transport);
  return client;
}

function postWithToken(token: string | null): Promise<Response> {
  const authorization: Record<string, string> = token === null ? {} : { authorization: `${BEARER_PREFIX}${token}` };
  return Promise.resolve(
    app.fetch(
      new Request(MCP_URL, {
        method: HttpMethod.Post,
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...authorization },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
    ),
  );
}

test('no token answers 401 with WWW-Authenticate', async () => {
  const response = await postWithToken(null);
  expect(response.status).toBe(HttpStatus.Unauthorized);
  expect(response.headers.get(CHALLENGE_HEADER)).toBe(CHALLENGE);
});

test.each([
  { name: 'every scope', token: OWNER_TOKEN, tools: Object.values(AgentTool) },
  {
    name: 'history read only',
    token: HISTORY_ONLY_TOKEN,
    tools: [AgentTool.ListDocuments, AgentTool.GetTimeline, AgentTool.GetBinEdits, AgentTool.ListTopics, AgentTool.SummarizeSelection],
  },
])('tools/list with $name lists the tools of the scopes', async ({ token, tools }) => {
  const client = await connect(token);
  const listed = await client.listTools();
  expect(listed.tools.map(({ name }) => name).sort()).toEqual([...tools].sort());
});

test('a token with no scope that opens a tool is refused with 403', async () => {
  const response = await postWithToken(NO_SCOPE_TOKEN);
  expect(response.status).toBe(HttpStatus.Forbidden);
});

test('every listed tool describes its input as an object schema', async () => {
  const client = await connect(OWNER_TOKEN);
  const { tools } = await client.listTools();
  expect(tools.map(({ inputSchema }) => inputSchema.type)).toEqual(tools.map(() => 'object'));
});

test('a tool call runs as the person of the token, twice on one connection', async () => {
  const client = await connect(OWNER_TOKEN);
  const calls = [FIRST_TOOL_CALL, SECOND_TOOL_CALL];
  const results = await Promise.all(calls.map(() => client.callTool({ name: AgentTool.ListDocuments, arguments: {} })));
  results.forEach((result) => {
    const [content] = result.content as { type: string; text: string }[];
    const listed = JSON.parse(content!.text) as DocumentsList;
    expect(listed.mine.map(({ id, role }) => [id, role])).toEqual([[documentId, DocumentRole.Owner]]);
  });
});

test('a tool outside the scopes of the token cannot be called', async () => {
  const client = await connect(HISTORY_ONLY_TOKEN);
  const result = await client
    .callTool({ name: AgentTool.RotateShareLink, arguments: { documentId, role: 'read' } })
    .catch((error: Error) => error);
  const failed = result instanceof Error || result.isError === true;
  expect(failed).toBe(true);
});

test.each([HttpMethod.Get, HttpMethod.Delete])('%s answers 405 because the server is stateless', async (method) => {
  const response = await Promise.resolve(app.fetch(new Request(MCP_URL, { method })));
  expect(response.status).toBe(HttpStatus.MethodNotAllowed);
});

test('a body over the limit answers 413 before any tool runs', async () => {
  const response = await Promise.resolve(
    app.fetch(
      new Request(MCP_URL, {
        method: HttpMethod.Post,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `${BEARER_PREFIX}${OWNER_TOKEN}`,
        },
        body: 'x'.repeat(MCP_BODY_MAX_BYTES + 1),
      }),
    ),
  );
  expect(response.status).toBe(HttpStatus.PayloadTooLarge);
});
