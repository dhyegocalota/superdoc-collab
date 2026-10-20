import type { ClientActor } from '@superdoc-collab/types';

export type CollaborationContext = {
  userId: string;
  documentId: string;
  actor: ClientActor;
  bootstrapAttempt: string | null;
  tabId: string | null;
  impersonationEndsAt: number | null;
};
