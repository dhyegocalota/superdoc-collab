import { DocumentRole, publicUserIdOf, type PublicViewer } from '@superdoc-collab/types';
import type { Auth } from '../auth/auth';
import type { DocumentsRepository } from '../documents/documents-repository';
import type { BootstrapState } from './bootstrap-state';
import { CollaborationAuthenticationError } from './authenticate-member';
import { verifyPublicRoomToken } from './public-room-tokens';

export async function authenticatePublic({
  auth,
  documents,
  bootstrap,
  token,
  documentId,
}: {
  auth: Auth;
  documents: DocumentsRepository;
  bootstrap: BootstrapState;
  token: string;
  documentId: string;
}): Promise<{ userId: string; role: DocumentRole; visitor: PublicViewer }> {
  const { secret } = await auth.$context;
  const visitor = verifyPublicRoomToken({ secret, token, documentId, now: Date.now() });
  if (!visitor) throw new CollaborationAuthenticationError();
  if (!documents.isPublic(documentId)) throw new CollaborationAuthenticationError();
  if (!bootstrap.isCommitted(documentId)) throw new CollaborationAuthenticationError();
  return { userId: publicUserIdOf(visitor.id), role: DocumentRole.Reader, visitor };
}
