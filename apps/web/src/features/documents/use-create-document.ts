import { documentPagePath, UNTITLED_DOCUMENT_TITLE, type DocumentSummary } from '@superdoc-history/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { createBlankDocument, DOCUMENTS_QUERY_KEY } from './documents-api';
import { NEW_DOCUMENT_STATE } from './new-document-state';

export function useCreateDocument(): UseMutationResult<DocumentSummary, Error, void> {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => createBlankDocument(UNTITLED_DOCUMENT_TITLE),
    onSuccess: async (document) => {
      await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
      await navigate(documentPagePath(document.id), { state: NEW_DOCUMENT_STATE });
    },
  });
}
