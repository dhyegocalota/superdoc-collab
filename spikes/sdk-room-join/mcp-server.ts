import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import { createAgentToolkit, createSuperDocClient, type SuperDocDocument } from '@superdoc/sdk';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const SERVER_NAME = 'superdoc-history-spike';
const SERVER_VERSION = '0.0.0';
const AGENT_PRESET = 'core';

type ToolDefinition = { name: string; description: string };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const collaborationUrl = requireEnv('HISTORY_COLLABORATION_URL');
const agentToken = requireEnv('HISTORY_AGENT_TOKEN');
const agentName = requireEnv('HISTORY_AGENT_NAME');

const sessions = new Map<string, SuperDocDocument>();
const client = createSuperDocClient({ user: { name: agentName, email: `${agentToken}@history.local` } });
const toolkit = await createAgentToolkit({ provider: 'vercel', preset: AGENT_PRESET, enforceChangeMode: 'tracked' });
const definitions = toolkit.tools as ToolDefinition[];

function definitionOf(name: string): ToolDefinition {
  const definition = definitions.find((candidate) => candidate.name === name);
  if (!definition) throw new Error(`The toolkit has no tool named ${name}.`);
  return definition;
}

function sessionOf(sessionId: string): SuperDocDocument {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Unknown session ${sessionId}.`);
  return session;
}

function asText(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

function createMcpServer(): McpServer {
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: toolkit.systemPrompt });

  server.registerTool(
    'superdoc_open',
    { title: 'Open live document', description: 'Join the live collaborative document by id. Returns a session_id for the other tools.', inputSchema: z.object({ document_id: z.string() }) },
    async ({ document_id }) => {
      await client.connect();
      const document = await client.open(
        { runtime: 'v2', collaboration: { providerType: 'hocuspocus', url: collaborationUrl, documentId: document_id, roomMode: 'join' } },
        { collaborationAuth: { type: 'token', token: agentToken } },
      );
      const sessionId = randomUUID();
      sessions.set(sessionId, document);
      return asText({ session_id: sessionId, document_id });
    },
  );

  server.registerTool(
    'superdoc_inspect',
    { title: 'Inspect', description: definitionOf('superdoc_inspect').description, inputSchema: z.object({ session_id: z.string() }).catchall(z.unknown()) },
    async ({ session_id, ...args }) => asText(await toolkit.dispatch(sessionOf(session_id), 'superdoc_inspect', args)),
  );

  server.registerTool(
    'superdoc_perform_action',
    { title: 'Perform action', description: definitionOf('superdoc_perform_action').description, inputSchema: z.object({ session_id: z.string() }).catchall(z.unknown()) },
    async ({ session_id, ...args }) => asText(await toolkit.dispatch(sessionOf(session_id), 'superdoc_perform_action', args)),
  );

  server.registerTool(
    'superdoc_save',
    { title: 'Save', description: 'Export the live document as a DOCX file at the given absolute path.', inputSchema: z.object({ session_id: z.string(), out: z.string() }) },
    async ({ session_id, out }) => asText(await sessionOf(session_id).save({ out })),
  );

  server.registerTool(
    'superdoc_close',
    { title: 'Close', description: 'Leave the live document. Edits already made stay in the room.', inputSchema: z.object({ session_id: z.string() }) },
    async ({ session_id }) => {
      await sessionOf(session_id).close({ discard: true });
      sessions.delete(session_id);
      return asText({ closed: true });
    },
  );
  return server;
}

const httpPort = process.env.HISTORY_MCP_PORT;
if (!httpPort) {
  await createMcpServer().connect(new StdioServerTransport());
} else {
  createServer(async (request, response) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = createMcpServer();
    response.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request, response);
  }).listen(Number(httpPort), '127.0.0.1', () => console.error(`MCP READY http://127.0.0.1:${httpPort}`));
}
