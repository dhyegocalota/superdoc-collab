import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildSeedDocx } from '@superdoc-history/history';
import {
  AgentActionKind,
  AgentScope,
  AgentTool,
  ApiPath,
  DocumentRole,
  DOCX_MIME_TYPE,
  ShareLinkRole,
  type DocumentTimeline,
  type ShareLinks,
} from '@superdoc-history/types';
import JSZip from 'jszip';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { memberWithRole } from '../testing/collaboration-client';
import { connectAgentClient, deleteConsent, type ConnectedAgentClient } from '../testing/oauth-client';
import { readTimeline } from '../testing/timeline-client';
import { signedInOwner, type TestServer, type TestUser } from '../testing/test-server';

const SEED_TEXT = 'Budget is approved.';
const REPLACEMENT = 'Plan';
const OWNER_AGENT_NAME = 'Ana · AI';
const PROJECTION_TIMEOUT_MS = 30_000;
const UNAUTHORIZED_PATTERN = /401/;
const BEARER_PREFIX = 'Bearer ';

let server: TestServer;
let owner: TestUser;
let reader: TestUser;
let documentId: string;
let connected: ConnectedAgentClient;
let client: Client;
const clients: Client[] = [];

type TextContent = { type: 'text'; text: string };

async function connectMcpClient(accessToken: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(`${server.baseUrl}${ApiPath.Mcp}`), {
    requestInit: { headers: { authorization: `${BEARER_PREFIX}${accessToken}` } },
  });
  const mcpClient = new Client({ name: 'mcp-over-oauth-test', version: '0.0.0' });
  clients.push(mcpClient);
  await mcpClient.connect(transport);
  return mcpClient;
}

async function callJson({ name, args }: { name: AgentTool; args: Record<string, unknown> }): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).not.toBe(true);
  const [content] = result.content as TextContent[];
  return JSON.parse(content!.text);
}

beforeAll(async () => {
  ({ server, owner } = await signedInOwner());
  reader = await memberWithRole({ server, documentId: await seededDocument(), role: DocumentRole.Reader });
  connected = await connectAgentClient({ server, user: owner });
  client = await connectMcpClient(connected.accessToken);
});

async function seededDocument(): Promise<string> {
  documentId = randomUUID();
  server.services.documents.create({ id: documentId, title: 'Plan', ownerUserId: owner.id });
  await server.services.storage.put({ documentId, bytes: await buildSeedDocx([{ text: SEED_TEXT, trackedChanges: [] }]) });
  server.services.runtime.importRevisions(documentId);
  return documentId;
}

afterAll(async () => {
  await Promise.all(clients.map((mcpClient) => mcpClient.close().catch(() => undefined)));
  await server.stop();
});

test('a client with every scope lists every tool', async () => {
  const { tools } = await client.listTools();
  expect(tools.map(({ name }) => name).sort()).toEqual(Object.values(AgentTool).sort());
});

test('get_timeline returns what the timeline API returns', async () => {
  const timeline = (await callJson({ name: AgentTool.GetTimeline, args: { documentId } })) as DocumentTimeline;
  expect(timeline).toEqual(await readTimeline({ server, documentId, cookie: owner.cookie }));
});

test('edit_document applies a tracked replacement that another person sees signed Ana · AI', async () => {
  const receipt = await callJson({
    name: AgentTool.EditDocument,
    args: { documentId, action: 'replace_text', edits: [{ find: 'Budget', replace: REPLACEMENT }] },
  });
  expect(receipt).toMatchObject({ status: 'ok' });
  const listed = await server.services.agentSessions.run({
    person: { userId: reader.id, name: 'Reader', email: reader.email },
    documentId,
    work: (document) => document.trackChanges.list({}),
  });
  expect(JSON.stringify(listed)).toContain(OWNER_AGENT_NAME);
  expect(JSON.stringify(listed)).toContain(REPLACEMENT);
});

test('export_docx returns the live document with its tracked change as a DOCX resource', async () => {
  const result = await client.callTool({ name: AgentTool.ExportDocx, arguments: { documentId } });
  const [content] = result.content as { type: 'resource'; resource: { mimeType: string; blob: string } }[];
  expect(content!.resource.mimeType).toBe(DOCX_MIME_TYPE);
  const archive = await JSZip.loadAsync(Buffer.from(content!.resource.blob, 'base64'));
  expect(await archive.file('word/document.xml')!.async('string')).toContain(REPLACEMENT);
});

test('rotating a share link leaves a mark on the timeline and the old link stops resolving', async () => {
  const before = server.services.shareLinks.links(documentId);
  const rotated = (await callJson({ name: AgentTool.RotateShareLink, args: { documentId, role: ShareLinkRole.Read } })) as ShareLinks;
  expect(rotated[ShareLinkRole.Read]).not.toBe(before[ShareLinkRole.Read]);
  await expect
    .poll(async () => (await readTimeline({ server, documentId, cookie: owner.cookie })).agentActions.map(({ kind }) => kind), {
      timeout: PROJECTION_TIMEOUT_MS,
    })
    .toEqual(expect.arrayContaining([AgentActionKind.DocumentExported, AgentActionKind.ShareLinkRotated]));
});

test('a client without the share scope does not see the share tools', async () => {
  const historyOnly = await connectAgentClient({ server, user: owner, scopes: [AgentScope.HistoryRead] });
  const historyClient = await connectMcpClient(historyOnly.accessToken);
  const { tools } = await historyClient.listTools();
  expect(tools.map(({ name }) => name)).not.toContain(AgentTool.GetShareLinks);
  expect(tools.map(({ name }) => name)).toContain(AgentTool.GetTimeline);
});

test('deleting the consent makes the next call fail with 401', async () => {
  await deleteConsent({ server, user: owner, consentId: connected.consentId });
  await expect(client.callTool({ name: AgentTool.ListDocuments, arguments: {} })).rejects.toThrow(UNAUTHORIZED_PATTERN);
});
