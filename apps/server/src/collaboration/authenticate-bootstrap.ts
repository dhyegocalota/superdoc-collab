import type { DocumentRole } from '@superdoc-collab/types';
import { verifyBootstrapToken } from '../agent/room-tokens';
import type { Auth } from '../auth/auth';
import type { DocumentsRepository } from '../documents/documents-repository';
import { CollaborationAuthenticationError } from './authenticate-member';
import type { RoomBootstrap } from './room-bootstrap';

export async function authenticateBootstrap({
  auth,
  documents,
  roomBootstrap,
  token,
  documentId,
}: {
  auth: Auth;
  documents: DocumentsRepository;
  roomBootstrap: RoomBootstrap;
  token: string;
  documentId: string;
}): Promise<{ userId: string; role: DocumentRole; bootstrapAttempt: string }> {
  const { secret } = await auth.$context;
  const verified = verifyBootstrapToken({ secret, token, documentId, now: Date.now() });
  if (!verified) throw new CollaborationAuthenticationError();
  if (!roomBootstrap.isCurrent({ documentId, attempt: verified.attempt })) throw new CollaborationAuthenticationError();
  const role = documents.findRole({ documentId, userId: verified.userId });
  if (!role) throw new CollaborationAuthenticationError();
  return { userId: verified.userId, role, bootstrapAttempt: verified.attempt };
}
