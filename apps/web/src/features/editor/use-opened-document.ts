import { useQuery } from '@tanstack/react-query';
import { openDocument, openedDocumentQueryKey } from './editor-api';

export enum DocumentReadiness {
  Ready = 'ready',
  Waiting = 'waiting',
  Paused = 'paused',
  Failed = 'failed',
  Unavailable = 'unavailable',
}

function notImplemented(): never {
  throw new Error('useOpenedDocument is not implemented');
}

export function useOpenedDocument(documentId: string) {
  const query = useQuery({
    queryKey: openedDocumentQueryKey(documentId),
    queryFn: () => openDocument(documentId),
    retry: false,
    gcTime: 0,
  });
  return { ...query, readiness: DocumentReadiness.Ready, keepWaiting: notImplemented, retry: notImplemented };
}
