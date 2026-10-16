import { ApiPath, type DocumentsList } from '@superdoc-history/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { DOCUMENTS_QUERY_KEY } from './documents-api';

async function fetchDocuments(): Promise<DocumentsList> {
  const response = await apiGet(ApiPath.Documents);
  if (!response.ok) throw new Error(`Documents request failed with status ${response.status}`);
  return response.json();
}

export function useDocuments(): UseQueryResult<DocumentsList> {
  return useQuery({ queryKey: DOCUMENTS_QUERY_KEY, queryFn: fetchDocuments });
}
