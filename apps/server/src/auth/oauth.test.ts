import { AgentScope, ApiPath, HttpStatus } from '@superdoc-history/types';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { signedInUser, startTestServer, type TestServer } from '../testing/test-server';

const AUTHORIZATION_SERVER_PATH = '/.well-known/oauth-authorization-server';
const FOREIGN_ORIGIN = 'https://evil.example';
const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource';

type AuthorizationServerMetadata = { issuer: string; scopes_supported: string[]; registration_endpoint: string };
type ProtectedResourceMetadata = { resource: string; authorization_servers: string[]; scopes_supported: string[] };

describe('oauth discovery', () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(async () => {
    await server.stop();
  });

  test('discovery documents name the MCP resource', async () => {
    const authorizationServer = await fetch(`${server.baseUrl}${AUTHORIZATION_SERVER_PATH}`);
    const protectedResource = await fetch(`${server.baseUrl}${PROTECTED_RESOURCE_PATH}`);
    expect(authorizationServer.status).toBe(HttpStatus.Ok);
    expect(protectedResource.status).toBe(HttpStatus.Ok);
    const authorizationMetadata = (await authorizationServer.json()) as AuthorizationServerMetadata;
    const resourceMetadata = (await protectedResource.json()) as ProtectedResourceMetadata;
    expect(authorizationMetadata.issuer).toBe(server.baseUrl);
    expect(resourceMetadata.resource).toBe(`${server.baseUrl}${ApiPath.Mcp}`);
    expect(resourceMetadata.authorization_servers).toEqual([server.baseUrl]);
    expect(resourceMetadata.scopes_supported).toEqual(expect.arrayContaining(Object.values(AgentScope)));
    expect(authorizationMetadata.scopes_supported).toEqual(expect.arrayContaining(Object.values(AgentScope)));
  });

  test('the protected resource metadata answers on the path-suffixed URL MCP clients try first', async () => {
    const response = await fetch(`${server.baseUrl}${PROTECTED_RESOURCE_PATH}${ApiPath.Mcp}`);
    expect(response.status).toBe(HttpStatus.Ok);
    expect(((await response.json()) as ProtectedResourceMetadata).resource).toBe(`${server.baseUrl}${ApiPath.Mcp}`);
  });

  test.each([
    { name: 'a foreign origin', isForeign: true, status: HttpStatus.Forbidden },
    { name: 'the app origin', isForeign: false, status: HttpStatus.BadRequest },
  ])('a consent post from $name answers $status', async ({ isForeign, status }) => {
    const victim = await signedInUser({ server, name: 'Victor' });
    const response = await fetch(`${server.baseUrl}${ApiPath.Auth}/oauth2/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: victim.cookie, origin: isForeign ? FOREIGN_ORIGIN : server.baseUrl },
      body: JSON.stringify({ accept: true }),
    });
    expect(response.status).toBe(status);
  });

  test('a signed-in person cannot rename themselves through update-user', async () => {
    const person = await signedInUser({ server, name: 'Paula' });
    const response = await fetch(`${server.baseUrl}${ApiPath.Auth}/update-user`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: person.cookie, origin: server.baseUrl },
      body: JSON.stringify({ name: 'Paula · AI' }),
    });
    const me = await fetch(`${server.baseUrl}${ApiPath.Me}`, { headers: { cookie: person.cookie } });
    expect(response.status).toBe(HttpStatus.NotFound);
    expect(((await me.json()) as { user: { name: string } }).user.name).toBe('Paula');
  });

  test.each([
    { name: 'create-client', method: 'POST', path: '/oauth2/create-client' },
    { name: 'the session token', method: 'GET', path: '/token' },
  ])('$name is not served', async ({ method, path }) => {
    const person = await signedInUser({ server, name: 'Tania' });
    const response = await fetch(`${server.baseUrl}${ApiPath.Auth}${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie: person.cookie, origin: server.baseUrl },
      body: method === 'POST' ? JSON.stringify({ client_name: 'x', redirect_uris: ['https://example.com/cb'] }) : undefined,
    });
    expect(response.status).toBe(HttpStatus.NotFound);
  });

  describe('dynamic client registration is bounded', () => {
    let nextAddress = 0;
    function register(body: Record<string, unknown>): Promise<Response> {
      nextAddress += 1;
      return fetch(`${server.baseUrl}${ApiPath.Auth}/oauth2/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.230.0.${nextAddress}` },
        body: JSON.stringify(body),
      });
    }
    const validBody = { client_name: 'Client', redirect_uris: ['https://example.com/callback'], token_endpoint_auth_method: 'none' };

    test.each([
      { name: 'a client name over the cap', body: { ...validBody, client_name: 'x'.repeat(300) }, status: HttpStatus.BadRequest },
      {
        name: 'more redirect uris than the cap',
        body: { ...validBody, redirect_uris: Array.from({ length: 40 }, (_, index) => `https://example.com/${index}`) },
        status: HttpStatus.BadRequest,
      },
      { name: 'a normal registration', body: validBody, status: HttpStatus.Created },
      {
        name: 'a five megabyte body',
        body: { ...validBody, client_name: 'x'.repeat(5 * 1024 * 1024) },
        status: HttpStatus.PayloadTooLarge,
      },
      {
        name: 'twenty thousand redirect uris',
        body: { ...validBody, redirect_uris: Array.from({ length: 20_000 }, (_, index) => `https://example.com/${index}`) },
        status: HttpStatus.PayloadTooLarge,
      },
    ])('$name answers $status', async ({ body, status }) => {
      expect((await register(body)).status).toBe(status);
    });
  });
});
