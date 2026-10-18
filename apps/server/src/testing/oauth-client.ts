import { createHash, createSign, generateKeyPairSync, randomBytes, randomUUID, type KeyObject } from 'node:crypto';
import { AgentScope, ApiPath, OFFLINE_ACCESS_SCOPE, SECOND_MS } from '@superdoc-collab/types';
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
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';
const POST_METHOD = 'POST';
const DIGEST = 'sha256';
const DPOP_HEADER = 'dpop';
const DPOP_PROOF_TYPE = 'dpop+jwt';
const DPOP_ALGORITHM = 'ES256';
const DPOP_CURVE = 'prime256v1';
const SIGNATURE_ENCODING = 'ieee-p1363';
const REGISTRATION_ADDRESS_PREFIX = '10.201.0';
const TOKEN_ADDRESS_PREFIX = '10.202.0';

enum OAuthPath {
  Register = '/oauth2/register',
  Authorize = '/oauth2/authorize',
  Consent = '/oauth2/consent',
  Token = '/oauth2/token',
  DeleteConsent = '/oauth2/delete-consent',
  UpdateConsent = '/oauth2/update-consent',
}

let nextAddress = 0;

export class OAuthStepFailedError extends Error {
  constructor({ step, status, body }: { step: string; status: number; body: string }) {
    super(`OAuth step ${step} failed with status ${status}: ${body}`);
  }
}

export type RequestedScope = AgentScope | typeof OFFLINE_ACCESS_SCOPE;

export type DpopKey = { privateKey: KeyObject; publicJwk: JsonWebKey };

export function createDpopKey(): DpopKey {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: DPOP_CURVE });
  return { privateKey, publicJwk: publicKey.export({ format: 'jwk' }) };
}

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function dpopProof({ key, method, url, accessToken }: { key: DpopKey; method: string; url: string; accessToken?: string }): string {
  const header = encodeSegment({ typ: DPOP_PROOF_TYPE, alg: DPOP_ALGORITHM, jwk: key.publicJwk });
  const accessTokenHash = accessToken ? { ath: createHash(DIGEST).update(accessToken).digest('base64url') } : {};
  const claims = encodeSegment({
    htm: method,
    htu: url,
    iat: Math.floor(Date.now() / SECOND_MS),
    jti: randomUUID(),
    ...accessTokenHash,
  });
  const signature = createSign(DIGEST).update(`${header}.${claims}`).sign({ key: key.privateKey, dsaEncoding: SIGNATURE_ENCODING });
  return `${header}.${claims}.${signature.toString('base64url')}`;
}

export type ConnectedAgentClient = {
  accessToken: string;
  refreshToken?: string;
  clientId: string;
  consentId: string;
  scopes: RequestedScope[];
};

async function requireOk({ step, response }: { step: string; response: Response }): Promise<Response> {
  if (response.ok) return response;
  throw new OAuthStepFailedError({ step, status: response.status, body: await response.text() });
}

function authUrl({ server, path }: { server: TestServer; path: string }): string {
  return `${server.baseUrl}${ApiPath.Auth}${path}`;
}

export async function registerAgentClient({ server, dpopBound = false }: { server: TestServer; dpopBound?: boolean }): Promise<string> {
  const response = await requireOk({
    step: 'register',
    response: await fetch(authUrl({ server, path: OAuthPath.Register }), {
      method: POST_METHOD,
      headers: { 'content-type': JSON_CONTENT_TYPE, 'x-forwarded-for': `${REGISTRATION_ADDRESS_PREFIX}.${nextAddress++}` },
      body: JSON.stringify({
        client_name: CLIENT_NAME,
        redirect_uris: [REDIRECT_URI],
        token_endpoint_auth_method: NO_CLIENT_SECRET,
        grant_types: [AUTHORIZATION_CODE_GRANT, REFRESH_TOKEN_GRANT],
        response_types: [CODE_RESPONSE_TYPE],
        dpop_bound_access_tokens: dpopBound,
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
  resourceParameters,
}: {
  server: TestServer;
  user: TestUser;
  clientId: string;
  scopes: RequestedScope[];
  challenge: string;
  resourceParameters: Record<string, string>;
}): Promise<string> {
  const query = new URLSearchParams({
    response_type: CODE_RESPONSE_TYPE,
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: scopes.join(' '),
    state: OAUTH_STATE,
    code_challenge: challenge,
    code_challenge_method: CHALLENGE_METHOD,
    ...resourceParameters,
  });
  const response = await requireOk({
    step: 'authorize',
    response: await fetch(`${authUrl({ server, path: OAuthPath.Authorize })}?${query}`, {
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
    response: await fetch(authUrl({ server, path: OAuthPath.Consent }), {
      method: POST_METHOD,
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
  dpopKey,
  resourceParameters,
}: {
  server: TestServer;
  clientId: string;
  code: string;
  verifier: string;
  dpopKey?: DpopKey;
  resourceParameters: Record<string, string>;
}): Promise<{ accessToken: string; refreshToken?: string }> {
  const tokenUrl = authUrl({ server, path: OAuthPath.Token });
  const dpopHeaders: Record<string, string> = dpopKey
    ? { [DPOP_HEADER]: dpopProof({ key: dpopKey, method: POST_METHOD, url: tokenUrl }) }
    : {};
  const response = await requireOk({
    step: 'token',
    response: await fetch(tokenUrl, {
      method: POST_METHOD,
      headers: { ...dpopHeaders, 'content-type': FORM_CONTENT_TYPE, 'x-forwarded-for': `${TOKEN_ADDRESS_PREFIX}.${nextAddress++}` },
      body: new URLSearchParams({
        grant_type: AUTHORIZATION_CODE_GRANT,
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: verifier,
        ...resourceParameters,
      }),
    }),
  });
  const { access_token, refresh_token } = (await response.json()) as { access_token: string; refresh_token?: string };
  return { accessToken: access_token, refreshToken: refresh_token };
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
  dpopKey,
  omitResource = false,
  clientId: existingClientId,
}: {
  server: TestServer;
  user: TestUser;
  scopes?: RequestedScope[];
  clientId?: string;
  dpopKey?: DpopKey;
  omitResource?: boolean;
}): Promise<ConnectedAgentClient> {
  const resourceParameters: Record<string, string> = omitResource ? {} : { resource: `${server.baseUrl}${ApiPath.Mcp}` };
  const clientId = existingClientId ? existingClientId : await registerAgentClient({ server, dpopBound: Boolean(dpopKey) });
  const verifier = randomBytes(CODE_VERIFIER_BYTES).toString('base64url');
  const challenge = createHash(DIGEST).update(verifier).digest('base64url');
  const consentQuery = await requestConsentQuery({ server, user, clientId, scopes, challenge, resourceParameters });
  const redirectUri = await approveConsent({ server, user, consentQuery, accept: true });
  const code = new URL(redirectUri).searchParams.get('code');
  if (!code) throw new OAuthStepFailedError({ step: 'code', status: 0, body: redirectUri });
  const tokens = await exchangeCode({ server, clientId, code, verifier, dpopKey, resourceParameters });
  const consentId = await findConsentId({ auth: server.auth, user, clientId });
  return { ...tokens, clientId, consentId, scopes };
}

export async function deleteConsent({ server, user, consentId }: { server: TestServer; user: TestUser; consentId: string }): Promise<void> {
  await requireOk({
    step: 'delete-consent',
    response: await fetch(authUrl({ server, path: OAuthPath.DeleteConsent }), {
      method: POST_METHOD,
      headers: { 'content-type': JSON_CONTENT_TYPE, cookie: user.cookie, origin: server.baseUrl },
      body: JSON.stringify({ id: consentId }),
    }),
  });
}

export async function updateConsent({
  server,
  user,
  consentId,
  scopes,
}: {
  server: TestServer;
  user: TestUser;
  consentId: string;
  scopes: RequestedScope[];
}): Promise<void> {
  await requireOk({
    step: 'update-consent',
    response: await fetch(authUrl({ server, path: OAuthPath.UpdateConsent }), {
      method: POST_METHOD,
      headers: { 'content-type': JSON_CONTENT_TYPE, cookie: user.cookie, origin: server.baseUrl },
      body: JSON.stringify({ id: consentId, update: { scopes } }),
    }),
  });
}

export async function refreshAccessToken({
  server,
  clientId,
  refreshToken,
}: {
  server: TestServer;
  clientId: string;
  refreshToken: string;
}): Promise<{ status: number; accessToken?: string; refreshToken?: string }> {
  const response = await fetch(authUrl({ server, path: OAuthPath.Token }), {
    method: POST_METHOD,
    headers: { 'content-type': FORM_CONTENT_TYPE, 'x-forwarded-for': `${TOKEN_ADDRESS_PREFIX}.${nextAddress++}` },
    body: new URLSearchParams({
      grant_type: REFRESH_TOKEN_GRANT,
      refresh_token: refreshToken,
      client_id: clientId,
      resource: `${server.baseUrl}${ApiPath.Mcp}`,
    }),
  });
  const body = (await response.json()) as { access_token?: string; refresh_token?: string };
  return { status: response.status, accessToken: body.access_token, refreshToken: body.refresh_token };
}
