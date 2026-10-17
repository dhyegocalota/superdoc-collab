import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  AgentScope,
  AgentTool,
  ApiPath,
  DocumentRole,
  HttpMethod,
  HttpStatus,
  RETRY_AFTER_HEADER,
  type DocumentsList,
} from '@superdoc-collab/types';
import { Hono } from 'hono';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { documentWithOwner } from '../testing/collaboration-client';
import { signedInUser } from '../testing/test-server';
import type { TestServer, TestUser } from '../testing/test-server';
import type { AgentToolPrincipal } from './agent-tool-context';
import { ALL_AGENT_SCOPES, sessionsOn } from './agent-tool-fixtures';
import { createMcpRoutes, MCP_BODY_MAX_BYTES, type McpRateLimit } from './mcp-route';

const APP_ORIGIN = 'http://app.test';
const MCP_URL = `${APP_ORIGIN}${ApiPath.Mcp}`;
const BEARER_PREFIX = 'Bearer ';
const CHALLENGE_HEADER = 'www-authenticate';
const CHALLENGE = 'Bearer resource_metadata="http://app.test/.well-known/oauth-protected-resource"';
const OWNER_TOKEN = 'owner-token';
const HISTORY_ONLY_TOKEN = 'history-only-token';
const OTHER_TOKEN = 'other-token';
const NO_SCOPE_TOKEN = 'no-scope-token';
const FIRST_TOOL_CALL = 1;
const SECOND_TOOL_CALL = 2;

let server: TestServer;
let documentId: string;
let owner: TestUser;
let other: TestUser;
let app: Hono;
const clients: Client[] = [];

beforeAll(async () => {
  ({ server, documentId, owner } = await documentWithOwner());
  other = await signedInUser({ server, name: 'Other' });
  app = appWith({});
});

function principalsOf(): Map<string, AgentToolPrincipal> {
  return new Map<string, AgentToolPrincipal>([
    [OWNER_TOKEN, { userId: owner.id, scopes: ALL_AGENT_SCOPES }],
    [HISTORY_ONLY_TOKEN, { userId: owner.id, scopes: [AgentScope.HistoryRead] }],
    [NO_SCOPE_TOKEN, { userId: owner.id, scopes: [] }],
    [OTHER_TOKEN, { userId: other.id, scopes: ALL_AGENT_SCOPES }],
  ]);
}

function appWith({ rateLimit }: { rateLimit?: McpRateLimit }): Hono {
  const principals = principalsOf();
  return new Hono().route(
    ApiPath.Mcp,
    createMcpRoutes({
      appOrigin: APP_ORIGIN,
      rateLimit,
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
}

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

const READ_ONLY_TOOLS = [
  AgentTool.ListDocuments,
  AgentTool.GetTimeline,
  AgentTool.GetBinEdits,
  AgentTool.ListTopics,
  AgentTool.InspectDocument,
  AgentTool.ListMembers,
  AgentTool.GetShareLinks,
  AgentTool.SummarizeSelection,
  AgentTool.ExportDocx,
];
const DESTRUCTIVE_TOOLS = [AgentTool.RotateShareLink, AgentTool.EditDocument];

test('tools/list carries a read-only or destructive annotation on every tool and none reaches the open world', async () => {
  const client = await connect(OWNER_TOKEN);
  const { tools } = await client.listTools();
  const annotationsOf = (name: string) => tools.find((tool) => tool.name === name)!.annotations;
  READ_ONLY_TOOLS.forEach((name) => expect(annotationsOf(name)).toMatchObject({ readOnlyHint: true, openWorldHint: false }));
  DESTRUCTIVE_TOOLS.forEach((name) =>
    expect(annotationsOf(name)).toMatchObject({ readOnlyHint: false, destructiveHint: true, openWorldHint: false }),
  );
  expect(READ_ONLY_TOOLS.length + DESTRUCTIVE_TOOLS.length).toBe(tools.length);
});

function postAs({ routes, token }: { routes: Hono; token: string }): Promise<Response> {
  return Promise.resolve(
    routes.fetch(
      new Request(MCP_URL, {
        method: HttpMethod.Post,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `${BEARER_PREFIX}${token}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
    ),
  );
}

test('a person over the call limit gets 429 with Retry-After while another person is served', async () => {
  const routes = appWith({ rateLimit: { maxCalls: 2, windowMs: 60_000 } });
  const statuses = await Promise.all(
    [OWNER_TOKEN, OWNER_TOKEN, OWNER_TOKEN].map(async (token) => (await postAs({ routes, token })).status),
  );
  const limited = await postAs({ routes, token: OWNER_TOKEN });
  expect(statuses.filter((status) => status === HttpStatus.TooManyRequests)).toHaveLength(1);
  expect(limited.status).toBe(HttpStatus.TooManyRequests);
  expect(Number(limited.headers.get(RETRY_AFTER_HEADER))).toBeGreaterThan(0);
  expect((await postAs({ routes, token: OTHER_TOKEN })).status).toBe(HttpStatus.Ok);
});

test('a JSON-RPC batch answers 400 and runs no tool', async () => {
  const listed = vi.spyOn(server.services.documents, 'list');
  const call = { jsonrpc: '2.0', method: 'tools/call', params: { name: AgentTool.ListDocuments, arguments: {} } };
  const response = await Promise.resolve(
    app.fetch(
      new Request(MCP_URL, {
        method: HttpMethod.Post,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `${BEARER_PREFIX}${OWNER_TOKEN}`,
        },
        body: JSON.stringify([
          { ...call, id: 1 },
          { ...call, id: 2 },
        ]),
      }),
    ),
  );
  expect(response.status).toBe(HttpStatus.BadRequest);
  expect(listed).not.toHaveBeenCalled();
  listed.mockRestore();
});
