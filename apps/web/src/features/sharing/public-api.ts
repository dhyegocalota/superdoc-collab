import { documentApiPath, DocumentResource, type PublicFlag } from '@superdoc-collab/types';
import { documentQueryKey } from '@/features/documents/documents-api';

export function publicFlagQueryKey(documentId: string): unknown[] {
  return documentQueryKey({ documentId, segments: [DocumentResource.Public] });
}

export async function fetchPublicFlag(documentId: string): Promise<PublicFlag> {
  throw new Error(`fetchPublicFlag is not implemented for ${documentApiPath({ documentId })}`);
}

export async function switchPublicFlag({ documentId, isPublic }: { documentId: string; isPublic: boolean }): Promise<PublicFlag> {
  throw new Error(`switchPublicFlag is not implemented for ${documentId} ${isPublic}`);
}
