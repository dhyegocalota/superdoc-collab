import { DOCUMENT_READY_GIVE_UP_MS, DOCUMENT_READY_POLL_MS, type OpenedDocument } from '@superdoc-collab/types';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DocumentUnavailableError } from '@/lib/api';
import { DocumentNotReadyError, openDocument, openedDocumentQueryKey } from './editor-api';

const GIVE_UP_POLL_COUNT = DOCUMENT_READY_GIVE_UP_MS / DOCUMENT_READY_POLL_MS;

export enum DocumentReadiness {
  Opening = 'opening',
  Ready = 'ready',
  Waiting = 'waiting',
  Paused = 'paused',
  Failed = 'failed',
  Unavailable = 'unavailable',
}

type ReadinessInput = { data: OpenedDocument | undefined; error: Error | null; errorCount: number; resumedAt: number };

function readinessOf({ data, error, errorCount, resumedAt }: ReadinessInput): DocumentReadiness {
  if (data) return DocumentReadiness.Ready;
  if (!error) return DocumentReadiness.Opening;
  if (error instanceof DocumentUnavailableError) return DocumentReadiness.Unavailable;
  if (!(error instanceof DocumentNotReadyError)) return DocumentReadiness.Failed;
  const hasGivenUp = errorCount - resumedAt >= GIVE_UP_POLL_COUNT;
  if (hasGivenUp) return DocumentReadiness.Paused;
  return DocumentReadiness.Waiting;
}

export function useOpenedDocument(documentId: string) {
  const [resume, setResume] = useState({ documentId, errorCount: 0 });
  const resumedAt = resume.documentId === documentId ? resume.errorCount : 0;
  const query = useQuery({
    queryKey: openedDocumentQueryKey(documentId),
    queryFn: () => openDocument(documentId),
    retry: false,
    gcTime: 0,
    refetchInterval: (current) => {
      const { data, error, errorUpdateCount } = current.state;
      const readiness = readinessOf({ data, error, errorCount: errorUpdateCount, resumedAt });
      return readiness === DocumentReadiness.Waiting ? DOCUMENT_READY_POLL_MS : false;
    },
  });
  const readiness = readinessOf({ data: query.data, error: query.error, errorCount: query.errorUpdateCount, resumedAt });
  const isNotReady = readiness === DocumentReadiness.Waiting || readiness === DocumentReadiness.Paused;

  function keepWaiting(): void {
    setResume({ documentId, errorCount: query.errorUpdateCount });
    void query.refetch();
  }

  function retry(): void {
    void query.refetch();
  }

  return {
    data: query.data,
    error: isNotReady ? null : query.error,
    isFetchedAfterMount: query.isFetchedAfterMount,
    readiness,
    keepWaiting,
    retry,
  };
}

export function useOpenedDocumentWithoutPolling(documentId: string) {
  return useOpenedDocument(documentId);
}
