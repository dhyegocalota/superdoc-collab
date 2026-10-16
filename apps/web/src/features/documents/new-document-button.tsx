import { documentPagePath, UNTITLED_DOCUMENT_TITLE } from '@superdoc-history/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { createBlankDocument, DOCUMENTS_QUERY_KEY } from './documents-api';
import { CREATE_ERROR_MESSAGE, NEW_DOCUMENT_LABEL } from './documents-copy';

export function NewDocumentButton() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { mutate, isPending, isError } = useMutation({
    mutationFn: () => createBlankDocument(UNTITLED_DOCUMENT_TITLE),
    onSuccess: async (document) => {
      await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
      await navigate(documentPagePath(document.id));
    },
  });

  return (
    <>
      <Button disabled={isPending} onClick={() => mutate()}>
        {NEW_DOCUMENT_LABEL}
      </Button>
      {isError && <p role="alert" className="text-sm text-destructive">{CREATE_ERROR_MESSAGE}</p>}
    </>
  );
}
