import { AgentScope, HttpStatus } from '@superdoc-history/types';
import { isAPIError } from 'better-auth/api';
import { requestToResourceInput, verifyAccessTokenRequest } from 'better-auth/oauth2';
import type { Auth } from '../auth/auth';
import { mcpResourceOf } from '../auth/auth';

const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource';
const JWKS_PATH = '/jwks';
const CONSENT_MODEL = 'oauthConsent';
const ACCESS_TOKEN_TYPE = 'at+jwt';
const SCOPE_SEPARATOR = ' ';
const TOKEN_SEPARATOR = ' ';
const JWT_SEPARATOR = '.';
const AGENT_SCOPES = new Set<string>(Object.values(AgentScope));

export type AgentPrincipal = { userId: string; clientId: string; scopes: AgentScope[] };

function isAccessTokenType(request: Request): boolean {
  const token = request.headers.get('authorization')?.trim().split(TOKEN_SEPARATOR).at(-1);
  const [header] = token?.split(JWT_SEPARATOR) ?? [];
  if (!header) return false;
  const { typ } = JSON.parse(Buffer.from(header, 'base64url').toString()) as { typ?: string };
  return typ === ACCESS_TOKEN_TYPE;
}

export class AgentVerificationUnavailableError extends Error {
  constructor() {
    super('Agent access tokens cannot be verified right now.');
  }
}

export async function authorizeAgentRequest({
  auth,
  request,
}: {
  auth: Auth;
  request: Request;
  jwksUrl: string;
}): Promise<AgentPrincipal | null> {
  const { adapter, baseURL } = await auth.$context;
  const appOrigin = new URL(baseURL).origin;
  const claims = await verifyAccessTokenRequest(requestToResourceInput(request), {
    verifyOptions: { issuer: appOrigin, audience: mcpResourceOf(appOrigin) },
    jwksUrl: `${baseURL}${JWKS_PATH}`,
  }).catch((error: unknown) => {
    if (isAPIError(error)) return null;
    throw error;
  });
  if (!claims || !isAccessTokenType(request)) return null;
  const { sub: userId, client_id: clientId, scope } = claims;
  if (typeof userId !== 'string' || typeof clientId !== 'string' || typeof scope !== 'string') return null;
  // NB ADR 0021: delete-consent leaves issued tokens valid, so the consent is checked per request
  const consent = await adapter.findOne({
    model: CONSENT_MODEL,
    where: [
      { field: 'userId', value: userId },
      { field: 'clientId', value: clientId },
    ],
  });
  if (!consent) return null;
  const scopes = scope.split(SCOPE_SEPARATOR).filter((granted): granted is AgentScope => AGENT_SCOPES.has(granted));
  return { userId, clientId, scopes };
}

export function unauthorizedAgentResponse({ appOrigin }: { appOrigin: string }): Response {
  return new Response(null, {
    status: HttpStatus.Unauthorized,
    headers: { 'www-authenticate': `Bearer resource_metadata="${appOrigin}${PROTECTED_RESOURCE_PATH}"` },
  });
}
