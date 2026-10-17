import type { AgentScope } from '@superdoc-history/types';
import type { Auth } from '../auth/auth';

export type AgentPrincipal = { userId: string; clientId: string; scopes: AgentScope[] };

export async function authorizeAgentRequest(_: { auth: Auth; request: Request }): Promise<AgentPrincipal | null> {
  throw new Error('authorizeAgentRequest is not implemented');
}

export function unauthorizedAgentResponse(_: { appOrigin: string }): Response {
  throw new Error('unauthorizedAgentResponse is not implemented');
}
