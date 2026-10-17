import { AgentScope, ApiPath, HttpStatus } from '@superdoc-collab/types';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { connectAgentClient, createDpopKey, deleteConsent, dpopProof } from '../testing/oauth-client';
import { signedInUser, startTestServer, type TestServer, type TestUser } from '../testing/test-server';
import { AgentVerificationUnavailableError, authorizeAgentRequest, unauthorizedAgentResponse } from './agent-authorization';

const DEAD_JWKS_URL = 'http://127.0.0.1:9/api/auth/jwks';
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
  function jwksUrl(): string {
    return `${server.baseUrl}${ApiPath.Auth}/jwks`;
  }
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
    const principal = await authorizeAgentRequest({ auth: server.auth, jwksUrl: jwksUrl(), request: bearerRequest(client.accessToken) });
    expect(principal).toEqual({ userId: user.id, clientId: client.clientId, scopes });
  });

  test('a token whose consent was deleted is refused', async () => {
    const client = await connectAgentClient({ server, user });
    await deleteConsent({ server, user, consentId: client.consentId });
    expect(await authorizeAgentRequest({ auth: server.auth, jwksUrl: jwksUrl(), request: bearerRequest(client.accessToken) })).toBeNull();
  });

  test('a token for another audience is refused', async () => {
    const client = await connectAgentClient({ server, user });
    const token = await forgedToken({ aud: OTHER_AUDIENCE, client_id: client.clientId });
    expect(await authorizeAgentRequest({ auth: server.auth, jwksUrl: jwksUrl(), request: bearerRequest(token) })).toBeNull();
  });

  test('an expired token is refused', async () => {
    const client = await connectAgentClient({ server, user });
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await forgedToken({
      client_id: client.clientId,
      iat: nowSeconds - EXPIRED_AGE_SECONDS,
      exp: nowSeconds - ONE_HOUR_SECONDS,
    });
    expect(await authorizeAgentRequest({ auth: server.auth, jwksUrl: jwksUrl(), request: bearerRequest(token) })).toBeNull();
  });

  test('a signed token for a client that never received consent is refused', async () => {
    const token = await forgedToken({ client_id: 'never-consented' });
    expect(await authorizeAgentRequest({ auth: server.auth, jwksUrl: jwksUrl(), request: bearerRequest(token) })).toBeNull();
  });

  test('a token without a client is refused', async () => {
    const token = await forgedToken({ client_id: undefined });
    expect(await authorizeAgentRequest({ auth: server.auth, jwksUrl: jwksUrl(), request: bearerRequest(token) })).toBeNull();
  });

  test('a client that omits the resource parameter still holds a token the agent route accepts', async () => {
    const client = await connectAgentClient({ server, user, omitResource: true });
    expect(
      await authorizeAgentRequest({ auth: server.auth, jwksUrl: jwksUrl(), request: bearerRequest(client.accessToken) }),
    ).toMatchObject({
      userId: user.id,
      clientId: client.clientId,
    });
  });

  test('a lowercase bearer scheme is accepted', async () => {
    const client = await connectAgentClient({ server, user });
    const request = new Request('http://localhost/api/mcp', { method: 'POST', headers: { authorization: `bearer ${client.accessToken}` } });
    expect(await authorizeAgentRequest({ auth: server.auth, jwksUrl: jwksUrl(), request })).toMatchObject({
      userId: user.id,
      clientId: client.clientId,
    });
  });

  test('a DPoP-bound token sent as a plain bearer is refused', async () => {
    const client = await connectAgentClient({ server, user });
    const token = await forgedToken({ client_id: client.clientId, cnf: { jkt: 'thumbprint-of-another-key' } });
    expect(await authorizeAgentRequest({ auth: server.auth, jwksUrl: jwksUrl(), request: bearerRequest(token) })).toBeNull();
  });

  test('a DPoP-bound token with a valid proof is accepted and without a proof is refused', async () => {
    const dpopKey = createDpopKey();
    const client = await connectAgentClient({ server, user, dpopKey });
    const publicUrl = `${server.baseUrl}${ApiPath.Mcp}`;
    const innerUrl = `http://localhost${ApiPath.Mcp}`;
    const proof = dpopProof({ key: dpopKey, method: 'POST', url: publicUrl, accessToken: client.accessToken });
    const proven = new Request(innerUrl, { method: 'POST', headers: { authorization: `DPoP ${client.accessToken}`, dpop: proof } });
    const unproven = new Request(innerUrl, { method: 'POST', headers: { authorization: `DPoP ${client.accessToken}` } });
    const asBearer = bearerRequest(client.accessToken);
    expect(await authorizeAgentRequest({ auth: server.auth, jwksUrl: jwksUrl(), request: proven })).toMatchObject({
      userId: user.id,
      clientId: client.clientId,
    });
    expect(await authorizeAgentRequest({ auth: server.auth, jwksUrl: jwksUrl(), request: unproven })).toBeNull();
    expect(await authorizeAgentRequest({ auth: server.auth, jwksUrl: jwksUrl(), request: asBearer })).toBeNull();
  });

  test('a proof signed for another path is refused', async () => {
    const dpopKey = createDpopKey();
    const client = await connectAgentClient({ server, user, dpopKey });
    const proof = dpopProof({ key: dpopKey, method: 'POST', url: `${server.baseUrl}/api/other`, accessToken: client.accessToken });
    const request = new Request(`http://localhost${ApiPath.Mcp}`, {
      method: 'POST',
      headers: { authorization: `DPoP ${client.accessToken}`, dpop: proof },
    });
    expect(await authorizeAgentRequest({ auth: server.auth, jwksUrl: jwksUrl(), request })).toBeNull();
  });

  test('an unreachable key set raises an unavailable error instead of a refusal', async () => {
    const client = await connectAgentClient({ server, user });
    await expect(
      authorizeAgentRequest({ auth: server.auth, jwksUrl: DEAD_JWKS_URL, request: bearerRequest(client.accessToken) }),
    ).rejects.toBeInstanceOf(AgentVerificationUnavailableError);
  });

  test('the agent route answers 503 when the key set cannot be fetched', async () => {
    const client = await connectAgentClient({ server, user });
    const original = server.services.jwksUrl;
    server.services.jwksUrl = () => DEAD_JWKS_URL;
    const response = await fetch(`${server.baseUrl}${ApiPath.Mcp}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${client.accessToken}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    server.services.jwksUrl = original;
    expect(response.status).toBe(HttpStatus.ServiceUnavailable);
  });

  test('a signed token that is not an access token type is refused even for a consented client', async () => {
    const client = await connectAgentClient({ server, user });
    const token = await forgedToken({ client_id: client.clientId });
    expect(await authorizeAgentRequest({ auth: server.auth, jwksUrl: jwksUrl(), request: bearerRequest(token) })).toBeNull();
  });

  test('the session token of a signed-in person is refused', async () => {
    const { token } = await server.auth.api.getToken({ headers: new Headers({ cookie: user.cookie }) });
    expect(await authorizeAgentRequest({ auth: server.auth, jwksUrl: jwksUrl(), request: bearerRequest(token) })).toBeNull();
  });

  test.each([
    { name: 'no authorization header', accessToken: null },
    { name: 'a malformed token', accessToken: 'not-a-jwt' },
  ])('$name is refused', async ({ accessToken }) => {
    expect(await authorizeAgentRequest({ auth: server.auth, jwksUrl: jwksUrl(), request: bearerRequest(accessToken) })).toBeNull();
  });

  test('the unauthorized response points clients at the protected resource metadata', () => {
    const response = unauthorizedAgentResponse({ appOrigin: server.baseUrl });
    expect(response.status).toBe(HttpStatus.Unauthorized);
    expect(response.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${server.baseUrl}/.well-known/oauth-protected-resource"`,
    );
  });
});
