import type { DocumentsList } from '@superdoc-collab/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { DOCUMENTS_QUERY_KEY, fetchDocuments } from './documents-api';

export function useDocuments(): UseQueryResult<DocumentsList> {
  return useQuery({ queryKey: DOCUMENTS_QUERY_KEY, queryFn: fetchDocuments });
}
