import { AgentScope, ApiPath, HttpStatus } from '@superdoc-history/types';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startTestServer, type TestServer } from '../testing/test-server';

const AUTHORIZATION_SERVER_PATH = '/.well-known/oauth-authorization-server';
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
});
