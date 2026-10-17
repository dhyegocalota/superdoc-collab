import { AgentScope, HttpStatus } from '@superdoc-collab/types';
import { isAPIError } from 'better-auth/api';
import { requestToResourceInput, verifyAccessTokenRequest, type ResourceRequestInput } from 'better-auth/oauth2';
import type { Auth } from '../auth/auth';
import { mcpResourceOf } from '../auth/auth';
import { describeError } from '../logging/describe-error';

const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource';
const VERIFICATION_UNAVAILABLE_LOG = 'Agent token verification unavailable:';
const CONSENT_MODEL = 'oauthConsent';
const ACCESS_TOKEN_TYPE = 'at+jwt';
const SCOPE_SEPARATOR = ' ';
const TOKEN_SEPARATOR = ' ';
const JWT_SEPARATOR = '.';
const AGENT_SCOPES = new Set<string>(Object.values(AgentScope));

export type AgentPrincipal = { userId: string; clientId: string; scopes: AgentScope[] };

function isAccessTokenType(request: Request): boolean {
  const token = request.headers.get('authorization')?.trim().split(TOKEN_SEPARATOR).at(-1);
  if (!token) return false;
  const [header] = token.split(JWT_SEPARATOR);
  if (!header) return false;
  const { typ } = JSON.parse(Buffer.from(header, 'base64url').toString()) as { typ?: string };
  return typ === ACCESS_TOKEN_TYPE;
}

export class AgentVerificationUnavailableError extends Error {
  constructor() {
    super('Agent access tokens cannot be verified right now.');
  }
}

function publicResourceInput({ request, appOrigin }: { request: Request; appOrigin: string }): ResourceRequestInput {
  const { pathname, search } = new URL(request.url);
  return { ...requestToResourceInput(request), url: `${appOrigin}${pathname}${search}` };
}

function rethrowUnavailable(error: unknown): never {
  console.error(`${VERIFICATION_UNAVAILABLE_LOG} ${describeError(error)}`);
  throw new AgentVerificationUnavailableError();
}

export async function authorizeAgentRequest({
  auth,
  request,
  jwksUrl,
}: {
  auth: Auth;
  request: Request;
  jwksUrl: string;
}): Promise<AgentPrincipal | null> {
  const { adapter, baseURL } = await auth.$context;
  const appOrigin = new URL(baseURL).origin;
  const claims = await verifyAccessTokenRequest(publicResourceInput({ request, appOrigin }), {
    verifyOptions: { issuer: appOrigin, audience: mcpResourceOf(appOrigin) },
    jwksUrl,
  }).catch((error: unknown) => {
    if (isAPIError(error)) return null;
    return rethrowUnavailable(error);
  });
  if (!claims || !isAccessTokenType(request)) return null;
  const { sub: userId, client_id: clientId, scope } = claims;
  if (typeof userId !== 'string' || typeof clientId !== 'string' || typeof scope !== 'string') return null;
  // NB ADR 0025: delete-consent leaves issued tokens valid, so the consent is checked per request
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
