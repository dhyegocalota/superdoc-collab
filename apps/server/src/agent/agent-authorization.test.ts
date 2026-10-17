import { AgentScope, ApiPath, HttpStatus } from '@superdoc-history/types';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { deleteConsent, connectAgentClient } from '../testing/oauth-client';
import { signedInUser, startTestServer, type TestServer, type TestUser } from '../testing/test-server';
import { authorizeAgentRequest, unauthorizedAgentResponse } from './agent-authorization';

const ONE_HOUR_SECONDS = 3600;
const OTHER_AUDIENCE = 'https://other.example/api/mcp';
const EXPIRED_AGE_SECONDS = 2 * ONE_HOUR_SECONDS;

function bearerRequest(accessToken: string | null): Request {
  const headers = new Headers();
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  return new Request('http://localhost/api/mcp', { method: 'POST', headers });
}

describe('agent authorization', () => {
  let server: TestServer;
  let user: TestUser;
  beforeAll(async () => {
    server = await startTestServer();
    user = await signedInUser({ server, name: 'Ana' });
  });
  afterAll(async () => {
    await server.stop();
  });

  async function forgedToken(claims: Record<string, unknown>): Promise<string> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const { token } = await server.auth.api.signJWT({
      body: {
        payload: {
          sub: user.id,
          aud: `${server.baseUrl}${ApiPath.Mcp}`,
          iss: server.baseUrl,
          client_id: 'forged-client',
          scope: AgentScope.HistoryRead,
          iat: nowSeconds,
          exp: nowSeconds + ONE_HOUR_SECONDS,
          ...claims,
        },
      },
    });
    return token;
  }

  test('a token with a live consent resolves to the person, the client and the granted scopes', async () => {
    const scopes = [AgentScope.HistoryRead, AgentScope.DocumentEdit];
    const client = await connectAgentClient({ server, user, scopes });
    const principal = await authorizeAgentRequest({ auth: server.auth, request: bearerRequest(client.accessToken) });
    expect(principal).toEqual({ userId: user.id, clientId: client.clientId, scopes });
  });

  test('a token whose consent was deleted is refused', async () => {
    const client = await connectAgentClient({ server, user });
    await deleteConsent({ server, user, consentId: client.consentId });
    expect(await authorizeAgentRequest({ auth: server.auth, request: bearerRequest(client.accessToken) })).toBeNull();
  });

  test('a token for another audience is refused', async () => {
    const client = await connectAgentClient({ server, user });
    const token = await forgedToken({ aud: OTHER_AUDIENCE, client_id: client.clientId });
    expect(await authorizeAgentRequest({ auth: server.auth, request: bearerRequest(token) })).toBeNull();
  });

  test('an expired token is refused', async () => {
    const client = await connectAgentClient({ server, user });
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await forgedToken({
      client_id: client.clientId,
      iat: nowSeconds - EXPIRED_AGE_SECONDS,
      exp: nowSeconds - ONE_HOUR_SECONDS,
    });
    expect(await authorizeAgentRequest({ auth: server.auth, request: bearerRequest(token) })).toBeNull();
  });

  test('a signed token for a client that never received consent is refused', async () => {
    const token = await forgedToken({ client_id: 'never-consented' });
    expect(await authorizeAgentRequest({ auth: server.auth, request: bearerRequest(token) })).toBeNull();
  });

  test('a token without a client is refused', async () => {
    const token = await forgedToken({ client_id: undefined });
    expect(await authorizeAgentRequest({ auth: server.auth, request: bearerRequest(token) })).toBeNull();
  });

  test.each([
    { name: 'no authorization header', accessToken: null },
    { name: 'a malformed token', accessToken: 'not-a-jwt' },
  ])('$name is refused', async ({ accessToken }) => {
    expect(await authorizeAgentRequest({ auth: server.auth, request: bearerRequest(accessToken) })).toBeNull();
  });

  test('the unauthorized response points clients at the protected resource metadata', () => {
    const response = unauthorizedAgentResponse({ appOrigin: server.baseUrl });
    expect(response.status).toBe(HttpStatus.Unauthorized);
    expect(response.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${server.baseUrl}/.well-known/oauth-protected-resource"`,
    );
  });
});
