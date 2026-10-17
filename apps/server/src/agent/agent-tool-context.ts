import type { AgentActionKind, AgentScope } from '@superdoc-collab/types';
import type { AgentToolkit, SuperDocDocument } from '@superdoc/sdk';
import type { AppServices } from '../http/app';

export type AgentToolPrincipal = { userId: string; scopes: AgentScope[] };
export type AgentPerson = { userId: string; name: string; email: string };
export type AgentDocumentSessions = {
  run: <Result>(options: {
    person: AgentPerson;
    documentId: string;
    work: (document: SuperDocDocument) => Promise<Result>;
  }) => Promise<Result>;
};
export type RecordAgentAction = (action: { documentId: string; userId: string; kind: AgentActionKind }) => void;
export type AgentToolContext = {
  services: AppServices;
  principal: AgentToolPrincipal;
  sessions: AgentDocumentSessions;
  toolkit: Pick<AgentToolkit, 'dispatch'>;
  recordAction: RecordAgentAction;
};
