import { agentAuthorKey } from '@superdoc-history/history';
import { agentAuthorName, ClientActor, type AgentActionView, type EventAuthor } from '@superdoc-history/types';
import type { AppServices } from '../http/app';
import { UnknownAuthorError } from './resolved-events';

export type AgentActionsInSpan = { actions: AgentActionView[]; authors: Record<string, EventAuthor> };

export function readAgentActions({
  services,
  documentId,
  span,
}: {
  services: AppServices;
  documentId: string;
  span: { from: number; until: number } | null;
}): AgentActionsInSpan {
  if (span === null) return { actions: [], authors: {} };
  const marks = services.agentActions.list({ documentName: documentId, from: span.from, until: span.until });
  const names = services.documents.userNames([...new Set(marks.map((mark) => mark.userId))]);
  const authors = marks.map((mark): [string, EventAuthor] => {
    const name = names.get(mark.userId);
    if (!name) throw new UnknownAuthorError(mark.userId);
    return [agentAuthorKey(mark.userId), { id: mark.userId, name: agentAuthorName(name), actor: ClientActor.Agent }];
  });
  return {
    actions: marks.map((mark) => ({ authorKey: agentAuthorKey(mark.userId), kind: mark.kind, createdAt: mark.createdAt })),
    authors: Object.fromEntries(authors),
  };
}
