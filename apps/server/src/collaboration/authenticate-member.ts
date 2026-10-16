import type { DocumentRole } from '@superdoc-history/types';
import type { Auth } from '../auth/auth';
import { readSession } from '../auth/session';
import type { DocumentsRepository } from '../documents/documents-repository';

export class CollaborationAuthenticationError extends Error {
  constructor() {
    super('No valid session on the collaboration socket.');
  }
}

export async function authenticateMember({ auth, documents, cookie, documentId }: { auth: Auth; documents: DocumentsRepository; cookie: string | undefined; documentId: string }): Promise<{ userId: string; role: DocumentRole }> {
  if (!cookie) throw new CollaborationAuthenticationError();
  const user = await readSession({ auth, headers: new Headers({ cookie }) });
  if (!user) throw new CollaborationAuthenticationError();
  const role = documents.findRole({ documentId, userId: user.id });
  if (!role) throw new CollaborationAuthenticationError();
  return { userId: user.id, role };
}
