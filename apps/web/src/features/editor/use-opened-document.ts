import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { OpenedDocument } from '@superdoc-history/types';
import { openDocument, openedDocumentQueryKey } from './editor-api';

export function useOpenedDocument(documentId: string): UseQueryResult<OpenedDocument> {
  return useQuery({ queryKey: openedDocumentQueryKey(documentId), queryFn: () => openDocument(documentId), retry: false });
}
