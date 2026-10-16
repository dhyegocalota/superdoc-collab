import { useQuery } from '@tanstack/react-query';
import { openDocument, openedDocumentQueryKey } from './editor-api';

export function useOpenedDocument(documentId: string) {
  return useQuery({ queryKey: openedDocumentQueryKey(documentId), queryFn: () => openDocument(documentId), retry: false, gcTime: 0 });
}
