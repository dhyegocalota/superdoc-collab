import { AgentScope, ApiPath, OFFLINE_ACCESS_SCOPE } from '@superdoc-history/types';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { connectAgentClient, deleteConsent, refreshAccessToken, updateConsent, type RequestedScope } from '../testing/oauth-client';
import { signedInUser, startTestServer, type TestServer, type TestUser } from '../testing/test-server';
import { authorizeAgentRequest } from './agent-authorization';

const FULL_SCOPES: RequestedScope[] = [...Object.values(AgentScope), OFFLINE_ACCESS_SCOPE];
const NARROW_SCOPES: RequestedScope[] = [AgentScope.HistoryRead, OFFLINE_ACCESS_SCOPE];
const REFUSED_STATUS_FLOOR = 400;

describe('revocation takes effect on the next call', () => {
  let server: TestServer;
  let user: TestUser;
  beforeAll(async () => {
    server = await startTestServer();
    user = await signedInUser({ server, name: 'Ana' });
  });
  afterAll(async () => {
    await server.stop();
  });

  async function scopesOf(accessToken: string): Promise<AgentScope[] | null> {
    const request = new Request(`${server.baseUrl}${ApiPath.Mcp}`, { method: 'POST', headers: { authorization: `Bearer ${accessToken}` } });
    const principal = await authorizeAgentRequest({ auth: server.auth, request, jwksUrl: `${server.baseUrl}${ApiPath.Auth}/jwks` });
    if (!principal) return null;
    return principal.scopes;
  }

  async function refreshedScopes({ clientId, refreshToken }: { clientId: string; refreshToken: string }): Promise<AgentScope[] | null> {
    const refreshed = await refreshAccessToken({ server, clientId, refreshToken });
    if (refreshed.status >= REFUSED_STATUS_FLOOR || !refreshed.accessToken) return null;
    return scopesOf(refreshed.accessToken);
  }

  test('a refresh token is refused after the consent is deleted', async () => {
    const client = await connectAgentClient({ server, user, scopes: FULL_SCOPES });
    await deleteConsent({ server, user, consentId: client.consentId });
    const refreshed = await refreshAccessToken({ server, clientId: client.clientId, refreshToken: client.refreshToken! });
    expect(refreshed.status).toBeGreaterThanOrEqual(REFUSED_STATUS_FLOOR);
  });

  test('a narrower re-consent narrows the old access token and leaves the old refresh token with no more than the narrower scopes', async () => {
    const client = await connectAgentClient({ server, user, scopes: FULL_SCOPES });
    await deleteConsent({ server, user, consentId: client.consentId });
    await connectAgentClient({ server, user, scopes: NARROW_SCOPES, clientId: client.clientId });
    expect(await scopesOf(client.accessToken)).toEqual([AgentScope.HistoryRead]);
    expect([null, [AgentScope.HistoryRead]]).toContainEqual(
      await refreshedScopes({ clientId: client.clientId, refreshToken: client.refreshToken! }),
    );
  });

  test('update-consent narrows an issued access token at once and the old refresh token cannot widen it', async () => {
    const client = await connectAgentClient({ server, user, scopes: FULL_SCOPES });
    await updateConsent({ server, user, consentId: client.consentId, scopes: NARROW_SCOPES });
    expect(await scopesOf(client.accessToken)).toEqual([AgentScope.HistoryRead]);
    expect([null, [AgentScope.HistoryRead]]).toContainEqual(
      await refreshedScopes({ clientId: client.clientId, refreshToken: client.refreshToken! }),
    );
  });

  test('a token with every scope is intact while the consent is untouched', async () => {
    const client = await connectAgentClient({ server, user, scopes: FULL_SCOPES });
    expect(await scopesOf(client.accessToken)).toEqual(Object.values(AgentScope));
  });
});
