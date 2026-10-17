import { createHash, randomBytes } from 'node:crypto';
import { AgentScope, ApiPath } from '@superdoc-history/types';
import type { Auth } from '../auth/auth';
import type { TestServer, TestUser } from './test-server';

const REDIRECT_URI = 'http://127.0.0.1/callback';
const CLIENT_NAME = 'Test agent client';
const CODE_VERIFIER_BYTES = 32;
const OAUTH_STATE = 'test-state';
const AUTHORIZATION_CODE_GRANT = 'authorization_code';
const REFRESH_TOKEN_GRANT = 'refresh_token';
const CODE_RESPONSE_TYPE = 'code';
const NO_CLIENT_SECRET = 'none';
const CHALLENGE_METHOD = 'S256';
const JSON_CONTENT_TYPE = 'application/json';

let nextRegistrationAddress = 0;

export class OAuthStepFailedError extends Error {
  constructor({ step, status, body }: { step: string; status: number; body: string }) {
    super(`OAuth step ${step} failed with status ${status}: ${body}`);
  }
}

export type ConnectedAgentClient = {
  accessToken: string;
  clientId: string;
  consentId: string;
  scopes: AgentScope[];
};

async function requireOk({ step, response }: { step: string; response: Response }): Promise<Response> {
  if (response.ok) return response;
  throw new OAuthStepFailedError({ step, status: response.status, body: await response.text() });
}

function authUrl({ server, path }: { server: TestServer; path: string }): string {
  return `${server.baseUrl}${ApiPath.Auth}${path}`;
}

export async function registerAgentClient({ server }: { server: TestServer }): Promise<string> {
  const response = await requireOk({
    step: 'register',
    response: await fetch(authUrl({ server, path: '/oauth2/register' }), {
      method: 'POST',
      headers: { 'content-type': JSON_CONTENT_TYPE, 'x-forwarded-for': `10.201.0.${nextRegistrationAddress++}` },
      body: JSON.stringify({
        client_name: CLIENT_NAME,
        redirect_uris: [REDIRECT_URI],
        token_endpoint_auth_method: NO_CLIENT_SECRET,
        grant_types: [AUTHORIZATION_CODE_GRANT, REFRESH_TOKEN_GRANT],
        response_types: [CODE_RESPONSE_TYPE],
      }),
    }),
  });
  const { client_id } = (await response.json()) as { client_id: string };
  return client_id;
}

async function requestConsentQuery({
  server,
  user,
  clientId,
  scopes,
  challenge,
}: {
  server: TestServer;
  user: TestUser;
  clientId: string;
  scopes: AgentScope[];
  challenge: string;
}): Promise<string> {
  const query = new URLSearchParams({
    response_type: CODE_RESPONSE_TYPE,
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: scopes.join(' '),
    state: OAUTH_STATE,
    code_challenge: challenge,
    code_challenge_method: CHALLENGE_METHOD,
    resource: `${server.baseUrl}${ApiPath.Mcp}`,
  });
  const response = await requireOk({
    step: 'authorize',
    response: await fetch(`${authUrl({ server, path: '/oauth2/authorize' })}?${query}`, {
      headers: { cookie: user.cookie, origin: server.baseUrl },
    }),
  });
  const { url } = (await response.json()) as { url: string };
  return new URL(url, server.baseUrl).search.slice(1);
}

export async function approveConsent({
  server,
  user,
  consentQuery,
  accept,
}: {
  server: TestServer;
  user: TestUser;
  consentQuery: string;
  accept: boolean;
}): Promise<string> {
  const response = await requireOk({
    step: 'consent',
    response: await fetch(authUrl({ server, path: '/oauth2/consent' }), {
      method: 'POST',
      headers: { 'content-type': JSON_CONTENT_TYPE, cookie: user.cookie, origin: server.baseUrl },
      body: JSON.stringify({ accept, oauth_query: consentQuery }),
    }),
  });
  const { url } = (await response.json()) as { url: string };
  return url;
}

async function exchangeCode({
  server,
  clientId,
  code,
  verifier,
}: {
  server: TestServer;
  clientId: string;
  code: string;
  verifier: string;
}): Promise<string> {
  const response = await requireOk({
    step: 'token',
    response: await fetch(authUrl({ server, path: '/oauth2/token' }), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': `10.202.0.${nextRegistrationAddress++}` },
      body: new URLSearchParams({
        grant_type: AUTHORIZATION_CODE_GRANT,
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: verifier,
        resource: `${server.baseUrl}${ApiPath.Mcp}`,
      }),
    }),
  });
  const { access_token } = (await response.json()) as { access_token: string };
  return access_token;
}

async function findConsentId({ auth, user, clientId }: { auth: Auth; user: TestUser; clientId: string }): Promise<string> {
  const consents = await auth.api.getOAuthConsents({ headers: new Headers({ cookie: user.cookie }) });
  const consent = consents.find((candidate) => candidate.clientId === clientId);
  if (!consent) throw new OAuthStepFailedError({ step: 'find-consent', status: 0, body: clientId });
  return consent.id;
}

export async function connectAgentClient({
  server,
  user,
  scopes = Object.values(AgentScope),
}: {
  server: TestServer;
  user: TestUser;
  scopes?: AgentScope[];
}): Promise<ConnectedAgentClient> {
  const clientId = await registerAgentClient({ server });
  const verifier = randomBytes(CODE_VERIFIER_BYTES).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const consentQuery = await requestConsentQuery({ server, user, clientId, scopes, challenge });
  const redirectUri = await approveConsent({ server, user, consentQuery, accept: true });
  const code = new URL(redirectUri).searchParams.get('code');
  if (!code) throw new OAuthStepFailedError({ step: 'code', status: 0, body: redirectUri });
  const accessToken = await exchangeCode({ server, clientId, code, verifier });
  const consentId = await findConsentId({ auth: server.auth, user, clientId });
  return { accessToken, clientId, consentId, scopes };
}

export async function deleteConsent({ server, user, consentId }: { server: TestServer; user: TestUser; consentId: string }): Promise<void> {
  await requireOk({
    step: 'delete-consent',
    response: await fetch(authUrl({ server, path: '/oauth2/delete-consent' }), {
      method: 'POST',
      headers: { 'content-type': JSON_CONTENT_TYPE, cookie: user.cookie, origin: server.baseUrl },
      body: JSON.stringify({ id: consentId }),
    }),
  });
}
