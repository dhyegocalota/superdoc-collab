import type { DocumentRole } from '@superdoc-collab/types';
import type { Auth } from '../auth/auth';
import { readSessionDetails } from '../auth/session';
import type { DocumentsRepository } from '../documents/documents-repository';

export class CollaborationAuthenticationError extends Error {
  constructor() {
    super('No valid session on the collaboration socket.');
  }
}

export async function authenticateMember({
  auth,
  documents,
  cookie,
  documentId,
}: {
  auth: Auth;
  documents: DocumentsRepository;
  cookie: string | undefined;
  documentId: string;
}): Promise<{ userId: string; role: DocumentRole; impersonationEndsAt: number | null }> {
  if (!cookie) throw new CollaborationAuthenticationError();
  const details = await readSessionDetails({ auth, headers: new Headers({ cookie }) });
  if (!details) throw new CollaborationAuthenticationError();
  const role = documents.findRole({ documentId, userId: details.user.id });
  if (!role) throw new CollaborationAuthenticationError();
  return { userId: details.user.id, role, impersonationEndsAt: details.impersonationEndsAt };
}
