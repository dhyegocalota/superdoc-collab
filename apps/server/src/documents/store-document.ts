import { PreparationSource } from '@superdoc-collab/types';
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
  preparation = PreparationSource.Server,
}: DocumentStorage & {
  ownerUserId: string;
  title: string;
  bytes: Uint8Array;
  importRevisions: boolean;
  isBlank: boolean;
  preparation?: PreparationSource;
}): Promise<string> {
  const documentId = randomUUID();
  documents.create({ id: documentId, title, ownerUserId });
  await storage.put({ documentId, bytes }).catch((error: unknown) => {
    documents.remove(documentId);
    throw error;
  });
  if (isBlank) runtime.bootstrapBlankRoom(documentId);
  const isPreparedOnDevice = !isBlank && preparation === PreparationSource.Device;
  if (!isBlank && !isPreparedOnDevice) runtime.bootstrapRoom(documentId);
  if (isPreparedOnDevice) runtime.bootstrapRoomOnDevice(documentId);
  if (importRevisions) runtime.importRevisions(documentId);
  return documentId;
}
