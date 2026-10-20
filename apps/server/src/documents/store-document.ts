import { randomUUID } from 'node:crypto';
import type { DocumentRuntime } from '../collaboration/collaboration-runtime';
import type { DocumentsRepository } from './documents-repository';
import type { DocumentFileStorage } from './file-storage';

export type DocumentStorage = { documents: DocumentsRepository; storage: DocumentFileStorage; runtime: DocumentRuntime };

export async function storeDocument({
  documents,
  storage,
  runtime,
  ownerUserId,
  title,
  bytes,
  importRevisions,
  isBlank,
}: DocumentStorage & {
  ownerUserId: string;
  title: string;
  bytes: Uint8Array;
  importRevisions: boolean;
  isBlank: boolean;
}): Promise<string> {
  const documentId = randomUUID();
  documents.create({ id: documentId, title, ownerUserId });
  await storage.put({ documentId, bytes }).catch((error: unknown) => {
    documents.remove(documentId);
    throw error;
  });
  if (isBlank) runtime.bootstrapBlankRoom(documentId);
  if (!isBlank) runtime.bootstrapRoom(documentId);
  if (importRevisions) runtime.importRevisions(documentId);
  return documentId;
}
