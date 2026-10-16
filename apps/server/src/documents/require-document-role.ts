import { DOCUMENT_ROLE_RANK, type DocumentRole } from '@superdoc-history/types';
import type { DocumentsRepository } from './documents-repository';

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

export function requireDocumentRole({ documents, documentId, userId, minimumRole }: { documents: DocumentsRepository; documentId: string; userId: string; minimumRole: DocumentRole }): DocumentRole {
  const role = documents.findRole({ documentId, userId });
  if (!role) throw new DocumentNotFoundError();
  if (DOCUMENT_ROLE_RANK[role] < DOCUMENT_ROLE_RANK[minimumRole]) throw new DocumentRoleTooLowError();
  return role;
}
