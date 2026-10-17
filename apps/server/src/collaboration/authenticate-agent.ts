import type { DocumentRole } from '@superdoc-collab/types';
import type { Auth } from '../auth/auth';
import { verifyRoomToken } from '../agent/room-tokens';
import type { DocumentsRepository } from '../documents/documents-repository';
import { CollaborationAuthenticationError } from './authenticate-member';

export async function authenticateAgent({
  auth,
  documents,
  token,
  documentId,
}: {
  auth: Auth;
  documents: DocumentsRepository;
  token: string;
  documentId: string;
}): Promise<{ userId: string; role: DocumentRole }> {
  const { secret } = await auth.$context;
  const verified = verifyRoomToken({ secret, token, documentId, now: Date.now() });
  if (!verified) throw new CollaborationAuthenticationError();
  const role = documents.findRole({ documentId, userId: verified.userId });
  if (!role) throw new CollaborationAuthenticationError();
  return { userId: verified.userId, role };
}
