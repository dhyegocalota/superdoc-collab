import { AppRoute, documentPagePath } from '@superdoc-collab/types';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BACK_TO_DOCUMENTS_LABEL, SHARE_OPENING_MESSAGE } from '@/features/editor/editor-copy';
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/documents-api';
import { useDocumentTitle } from '@/lib/use-document-title';
import { useRequiredParam } from '@/lib/use-required-param';
import { acceptShareLink } from './share-api';

export function ShareLandingPage() {
  const token = useRequiredParam('token');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const hasRequested = useRef(false);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  useDocumentTitle(null);

  useEffect(() => {
    if (hasRequested.current) return;
    hasRequested.current = true;
    acceptShareLink(token)
      .then(async ({ documentId }) => {
        await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
        await navigate(documentPagePath(documentId), { replace: true });
      })
      .catch((error: Error) => setFailureMessage(error.message));
  }, [token, queryClient, navigate]);

  if (!failureMessage)
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p role="status" className="text-sm text-muted-foreground">
          {SHARE_OPENING_MESSAGE}
        </p>
      </main>
    );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <p role="alert">{failureMessage}</p>
      <Link to={AppRoute.Documents} className="underline">
        {BACK_TO_DOCUMENTS_LABEL}
      </Link>
    </main>
  );
}
