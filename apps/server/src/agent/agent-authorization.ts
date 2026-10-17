import { AgentScope, HttpStatus } from '@superdoc-history/types';
import type { Auth } from '../auth/auth';

const BEARER_PREFIX = 'Bearer ';
const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource';
const CONSENT_MODEL = 'oauthConsent';
const AGENT_SCOPES = new Set<string>(Object.values(AgentScope));

export type AgentPrincipal = { userId: string; clientId: string; scopes: AgentScope[] };

type AccessTokenClaims = { sub?: unknown; client_id?: unknown; scope?: unknown };

function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith(BEARER_PREFIX)) return null;
  return header.slice(BEARER_PREFIX.length);
}

export async function authorizeAgentRequest({ auth, request }: { auth: Auth; request: Request }): Promise<AgentPrincipal | null> {
  const token = readBearerToken(request);
  if (!token) return null;
  const { payload } = await auth.api.verifyJWT({ body: { token } });
  if (!payload) return null;
  const { sub: userId, client_id: clientId, scope } = payload as AccessTokenClaims;
  if (typeof userId !== 'string' || typeof clientId !== 'string' || typeof scope !== 'string') return null;
  const { adapter } = await auth.$context;
  // NB ADR 0021: delete-consent leaves issued tokens valid, so the consent is checked per request
  const consent = await adapter.findOne({
    model: CONSENT_MODEL,
    where: [
      { field: 'userId', value: userId },
      { field: 'clientId', value: clientId },
    ],
  });
  if (!consent) return null;
  const scopes = scope.split(' ').filter((granted): granted is AgentScope => AGENT_SCOPES.has(granted));
  return { userId, clientId, scopes };
}

export function unauthorizedAgentResponse({ appOrigin }: { appOrigin: string }): Response {
  return new Response(null, {
    status: HttpStatus.Unauthorized,
    headers: { 'www-authenticate': `Bearer resource_metadata="${appOrigin}${PROTECTED_RESOURCE_PATH}"` },
  });
}
