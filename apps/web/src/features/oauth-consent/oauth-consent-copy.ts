import { AgentScope, OFFLINE_ACCESS_SCOPE } from '@superdoc-history/types';

export const OFFLINE_ACCESS_LABEL = 'Stay connected until you revoke it';
export const CONSENT_HEADING = 'Connect an AI client';
export const APPROVE_LABEL = 'Approve';
export const DENY_LABEL = 'Deny';
export const APPROVING_LABEL = 'Approving…';
export const SCOPES_HEADING = 'It will be able to';
export const CLIENT_LOADING_LABEL = 'Loading the client';
export const CLIENT_LOAD_ERROR_MESSAGE = 'The client could not be loaded.';
export const CONSENT_FAILED_MESSAGE = 'Your answer could not be sent. Try again.';
export const INCOMPLETE_REQUEST_MESSAGE = 'This authorization request is incomplete.';

export function redirectNotice(host: string): string {
  return `Access will be sent to ${host}.`;
}

export function appRedirectNotice(scheme: string): string {
  return `Access will be sent to the app ${scheme}.`;
}

export function consentDescription(clientName: string): string {
  return `${clientName} asks to act on your behalf in your documents.`;
}

export const SCOPE_LABELS: Record<AgentScope, string> = {
  [AgentScope.HistoryRead]: 'Read the edit history of your documents',
  [AgentScope.DocumentEdit]: 'Edit your documents, shown as tracked changes signed as AI',
  [AgentScope.DocumentExport]: 'Export your documents as .docx files',
  [AgentScope.DocumentShare]: 'See and rotate the share links of your documents',
};

const KNOWN_SCOPES: string[] = Object.values(AgentScope);

function isAgentScope(scope: string): scope is AgentScope {
  return KNOWN_SCOPES.includes(scope);
}

export function scopeLabel(scope: string): string {
  if (scope === OFFLINE_ACCESS_SCOPE) return OFFLINE_ACCESS_LABEL;
  if (!isAgentScope(scope)) return scope;
  return SCOPE_LABELS[scope];
}
