import type { DocumentsList } from '@superdoc-collab/types';
import { useQueryClient } from '@tanstack/react-query';
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/documents-api';

export function useCachedTitle(documentId: string): string | null {
  const queryClient = useQueryClient();
  const documentList = queryClient.getQueryData<DocumentsList>(DOCUMENTS_QUERY_KEY);
  if (!documentList) return null;
  const summary = [...documentList.mine, ...documentList.shared].find((candidate) => candidate.id === documentId);
  if (!summary) return null;
  return summary.title;
}
