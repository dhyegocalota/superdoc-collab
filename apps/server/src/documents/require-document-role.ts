import { DOCUMENT_ROLE_RANK, type DocumentRole } from '@superdoc-history/types';
import type { Context } from 'hono';
import type { SignedIn } from '../http/require-user';
import type { DocumentsRepository } from './documents-repository';

const DOCUMENT_ID_PARAM = 'documentId';

export class DocumentNotFoundError extends Error {
  constructor() {
    super('Document not found');
  }
}

export class DocumentRoleTooLowError extends Error {
  constructor() {
    super('Document role is too low');
  }
}

export function requireDocumentRole({
  documents,
  documentId,
  userId,
  minimumRole,
}: {
  documents: DocumentsRepository;
  documentId: string;
  userId: string;
  minimumRole: DocumentRole;
}): DocumentRole {
  const role = documents.findRole({ documentId, userId });
  if (!role) throw new DocumentNotFoundError();
  if (DOCUMENT_ROLE_RANK[role] < DOCUMENT_ROLE_RANK[minimumRole]) throw new DocumentRoleTooLowError();
  return role;
}

export function authorizedDocumentId({
  context,
  documents,
  minimumRole,
}: {
  context: Context<SignedIn>;
  documents: DocumentsRepository;
  minimumRole: DocumentRole;
}): string {
  const documentId = context.req.param(DOCUMENT_ID_PARAM);
  if (!documentId) throw new DocumentNotFoundError();
  requireDocumentRole({ documents, documentId, userId: context.var.user.id, minimumRole });
  return documentId;
}
