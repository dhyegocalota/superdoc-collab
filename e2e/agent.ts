import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { expect, type APIRequestContext, type Locator, type Page, type Request } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AgentScope, AgentTool, ApiPath, AppRoute, ShareLinkRole, UTC_TIME_ZONE, type DocumentTimeline } from '../libs/types/src';
import { APPROVE_LABEL, consentDescription, redirectNotice } from '../apps/web/src/features/oauth-consent/oauth-consent-copy';
import { CONNECTED_APPS_HEADING, revokeLabel } from '../apps/web/src/features/connected-apps/connected-apps-copy';

enum EditAction {
  ReplaceText = 'replace_text',
}

const DISCOVERY_PATH = '/.well-known/oauth-authorization-server';
const REDIRECT_PATH = '/e2e-oauth-callback';
const CLIENT_NAME_PREFIX = 'E2E MCP client';
const CLIENT_NAME_SUFFIX_LENGTH = 8;
const PKCE_VERIFIER_BYTES = 32;
const STATE_BYTES = 16;
const CODE_CHALLENGE_METHOD = 'S256';
const MCP_CLIENT_NAME = 'e2e-mcp-client';
const MCP_CLIENT_VERSION = '1.0.0';
const CONSENT_TIMEOUT_MS = 30_000;
const TRACKED_CHANGE_CARD_SELECTOR = '.comments-dialog.floating-comment';

type AuthorizationServerMetadata = {
  registration_endpoint: string;
  authorization_endpoint: string;
  token_endpoint: string;
};

export type RegisteredClient = { clientId: string; clientName: string; redirectUri: string; metadata: AuthorizationServerMetadata };
export type AgentConnection = RegisteredClient & { accessToken: string; origin: string };
export type ToolResult = {
  isError?: boolean;
  content: { type: string; text?: string; resource?: { mimeType: string; blob?: string } }[];
};

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

export async function registerClient({ request, origin }: { request: APIRequestContext; origin: string }): Promise<RegisteredClient> {
  const discovery = await request.get(`${origin}${DISCOVERY_PATH}`);
  expect(discovery.ok()).toBe(true);
  const metadata = (await discovery.json()) as AuthorizationServerMetadata;
  const clientName = `${CLIENT_NAME_PREFIX} ${randomUUID().slice(0, CLIENT_NAME_SUFFIX_LENGTH)}`;
  const redirectUri = `${origin}${REDIRECT_PATH}`;
  const registration = await request.post(metadata.registration_endpoint, {
    data: {
      client_name: clientName,
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    },
  });
  expect(registration.ok()).toBe(true);
  const { client_id: clientId } = (await registration.json()) as { client_id: string };
  return { clientId, clientName, redirectUri, metadata };
}

export async function beginAuthorization({
  page,
  client,
  origin,
}: {
  page: Page;
  client: RegisteredClient;
  origin: string;
}): Promise<{ verifier: string; state: string; callback: Promise<Request> }> {
  const verifier = base64Url(randomBytes(PKCE_VERIFIER_BYTES));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  const state = base64Url(randomBytes(STATE_BYTES));
  const authorizeUrl = new URL(client.metadata.authorization_endpoint);
  authorizeUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    scope: Object.values(AgentScope).join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: CODE_CHALLENGE_METHOD,
    resource: `${origin}${ApiPath.Mcp}`,
  }).toString();
  await page.route(`${client.redirectUri}*`, (route) => route.fulfill({ status: 200, body: '' }));
  const callback = page.waitForRequest((request) => request.url().startsWith(client.redirectUri));
  await page.goto(authorizeUrl.toString());
  return { verifier, state, callback };
}

export async function approveConsentPage({
  page,
  client,
  state,
  callback,
}: {
  page: Page;
  client: RegisteredClient;
  state: string;
  callback: Promise<Request>;
}): Promise<string> {
  await expect(page).toHaveURL(new RegExp(`${AppRoute.OAuthConsent}\\?`));
  await expect(page.getByText(consentDescription(client.clientName))).toBeVisible({ timeout: CONSENT_TIMEOUT_MS });
  await expect(page.getByText(redirectNotice(new URL(client.redirectUri).host))).toBeVisible();
  await page.getByRole('button', { name: APPROVE_LABEL }).click();
  const redirected = new URL((await callback).url());
  expect(redirected.searchParams.get('state')).toBe(state);
  const code = redirected.searchParams.get('code');
  if (!code) throw new Error(`The authorization redirect carried no code: ${redirected.toString()}`);
  return code;
}

export async function approveConsent({
  page,
  client,
  origin,
}: {
  page: Page;
  client: RegisteredClient;
  origin: string;
}): Promise<{ code: string; verifier: string }> {
  const { verifier, state, callback } = await beginAuthorization({ page, client, origin });
  const code = await approveConsentPage({ page, client, state, callback });
  return { code, verifier };
}

export async function exchangeCode({
  request,
  origin,
  client,
  code,
  verifier,
}: {
  request: APIRequestContext;
  origin: string;
  client: RegisteredClient;
  code: string;
  verifier: string;
}): Promise<string> {
  const response = await request.post(client.metadata.token_endpoint, {
    form: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: client.redirectUri,
      client_id: client.clientId,
      code_verifier: verifier,
      resource: `${origin}${ApiPath.Mcp}`,
    },
  });
  expect(response.ok()).toBe(true);
  const { access_token: accessToken } = (await response.json()) as { access_token: string };
  return accessToken;
}

export async function connectAiClient({ page, request }: { page: Page; request: APIRequestContext }): Promise<AgentConnection> {
  await page.goto(AppRoute.Documents);
  const origin = new URL(page.url()).origin;
  const client = await registerClient({ request, origin });
  const { code, verifier } = await approveConsent({ page, client, origin });
  const accessToken = await exchangeCode({ request, origin, client, code, verifier });
  return { ...client, accessToken, origin };
}

export async function callTool({
  connection: { origin, accessToken },
  tool,
  args,
}: {
  connection: AgentConnection;
  tool: AgentTool;
  args: Record<string, unknown>;
}): Promise<ToolResult> {
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}${ApiPath.Mcp}`), {
    requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const client = new Client({ name: MCP_CLIENT_NAME, version: MCP_CLIENT_VERSION });
  await client.connect(transport);
  try {
    return (await client.callTool({ name: tool, arguments: args })) as ToolResult;
  } finally {
    await client.close();
  }
}

export function toolJson<Shape>(result: ToolResult): Shape {
  expect(result.isError).not.toBe(true);
  const text = result.content.find((part) => part.type === 'text')?.text;
  if (!text) throw new Error('The tool result carried no text');
  return JSON.parse(text) as Shape;
}

export async function openConnectedApps({ page, clientName }: { page: Page; clientName: string }): Promise<void> {
  await page.goto(AppRoute.ConnectedApps);
  await expect(page.getByRole('heading', { name: CONNECTED_APPS_HEADING })).toBeVisible();
  await expect(page.getByText(clientName, { exact: true })).toBeVisible();
}

export async function revokeConnectedApp({ page, clientName }: { page: Page; clientName: string }): Promise<void> {
  await page.getByRole('button', { name: revokeLabel(clientName) }).click();
  await expect(page.getByText(clientName, { exact: true })).toHaveCount(0);
}

export function trackedChangeCards(page: Page): Locator {
  return page.locator(TRACKED_CHANGE_CARD_SELECTOR);
}

export async function readTimelineThroughAgent({
  connection,
  documentId,
}: {
  connection: AgentConnection;
  documentId: string;
}): Promise<DocumentTimeline> {
  return toolJson<DocumentTimeline>(
    await callTool({ connection, tool: AgentTool.GetTimeline, args: { documentId, timeZone: UTC_TIME_ZONE } }),
  );
}

export async function replaceTextThroughAgent({
  connection,
  documentId,
  find,
  replace,
}: {
  connection: AgentConnection;
  documentId: string;
  find: string;
  replace: string;
}): Promise<ToolResult> {
  const args = { documentId, action: EditAction.ReplaceText, edits: [{ find, replace }] };
  return callTool({ connection, tool: AgentTool.EditDocument, args });
}

export async function rotateShareLinkThroughAgent({
  connection,
  documentId,
  role,
}: {
  connection: AgentConnection;
  documentId: string;
  role: ShareLinkRole;
}): Promise<{ rotated: ShareLinkRole; documentUrl: string }> {
  return toolJson(await callTool({ connection, tool: AgentTool.RotateShareLink, args: { documentId, role } }));
}

export async function rejectedStatus(call: Promise<unknown>): Promise<number> {
  try {
    await call;
  } catch (error) {
    if (error instanceof StreamableHTTPError && error.code !== undefined) return error.code;
    throw error;
  }
  throw new Error('The call was accepted');
}

export async function exportDocxThroughAgent({
  connection,
  documentId,
}: {
  connection: AgentConnection;
  documentId: string;
}): Promise<{ mimeType: string; bytes: Buffer }> {
  const result = await callTool({ connection, tool: AgentTool.ExportDocx, args: { documentId } });
  expect(result.isError).not.toBe(true);
  const resource = result.content.find((part) => part.type === 'resource')?.resource;
  if (!resource?.blob) throw new Error('The export carried no embedded resource');
  return { mimeType: resource.mimeType, bytes: Buffer.from(resource.blob, 'base64') };
}
